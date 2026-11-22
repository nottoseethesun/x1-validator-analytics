/**
 * Tests of fetch-total-validator-earnings.js, the real script, given an
 * option or a config.json it refuses, run in a child process against a
 * stand-in X1 endpoint and a stand-in GeckoTerminal, so they ask nothing
 * outside the computer.
 * @module test/refused-settings.test
 *
 * Each run stops with exit code 1, naming the option or the setting at
 * fault, before it asks the chain anything: a typed value meets its
 * option's parser, and config.json meets its JSON Schema
 * (`configLoader.js`), whose kinds of value the parsers are made from.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { startStandInX1 } from "./helpers/stand-in-x1.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { runScript, VOTE_PUBKEY } from "./helpers/run-script.js";

const REWARD_LAMPORTS = 1234567891;

/** The stand-in chain's time: 12:00 UTC on 2026-11-10. */
const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

/**
 * Starts a stand-in chain that pays the account every epoch, and a
 * stand-in GeckoTerminal with no candles.
 *
 * @returns {Promise<{x1: Object, server: Object, close: function(): Promise<void>}>} The stand-ins
 */
async function startStandIns() {
  const x1 = await startStandInX1({
    votePubkey: VOTE_PUBKEY,
    rewardLamports: REWARD_LAMPORTS,
    nowSeconds: NOW_SECONDS,
  });
  const server = await serveStandInGeckoTerminal(
    standInGeckoTerminal({ candles: [] }),
  );
  return {
    x1,
    server,
    close: async () => Promise.all([x1.close(), server.close()]),
  };
}

describe("fetch-total-validator-earnings.js, given a wrong option", () => {
  for (const [args, option] of [
    [["--vote-pubkey", "abc"], "--vote-pubkey <pubkey>"],
    [["--vote-pubkey", "0OIl" + "1".repeat(40)], "--vote-pubkey <pubkey>"],
    [["--liquidity-pool-address", "not-a-key"], "--liquidity-pool-address"],
    [["--rpc-url", "notaurl"], "--rpc-url <url>"],
    [["--rpc-url", "ftp://example.com"], "--rpc-url <url>"],
  ]) {
    it(`refuses ${args.join(" ")} with exit code 1, naming the option, before it asks anything`, async () => {
      const run = await runScript({
        rpcUrl: "http://127.0.0.1:1",
        geckoTerminalUrl: "http://127.0.0.1:1",
        args,
      });
      assert.equal(run.code, 1);
      assert.match(run.stderr, /argument '.*' is invalid/);
      assert.ok(run.stderr.includes(option), run.stderr);
      assert.doesNotMatch(run.stderr, /ECONNREFUSED/);
    });
  }
});

describe("fetch-total-validator-earnings.js, with a config.json it cannot take", () => {
  it("refuses requestTimeoutSeconds that is not a number above 0, with exit code 1", async () => {
    const standIns = await startStandIns();
    try {
      for (const limit of ["abc", 0, -5]) {
        const run = await runScript({
          rpcUrl: standIns.x1.url,
          geckoTerminalUrl: standIns.server.url,
          config: { requestTimeoutSeconds: limit },
        });
        assert.equal(run.code, 1);
        assert.ok(
          run.stderr
            .split("\n")
            .includes(
              `Error: config.json → requestTimeoutSeconds must be a number above 0; it is ${JSON.stringify(limit)}`,
            ),
          run.stderr,
        );
      }
    } finally {
      await standIns.close();
    }
  });

  it("stops with exit code 1, naming the file, when config.json is not JSON", async () => {
    // No epoch pays the account, so a run that went on with the defaults
    // would ask no GeckoTerminal, and --rpc-url keeps it on the stand-in
    // chain.
    const x1 = await startStandInX1({
      votePubkey: VOTE_PUBKEY,
      rewardLamports: REWARD_LAMPORTS,
      nowSeconds: NOW_SECONDS,
      noRewardThrough: 500,
    });
    try {
      const run = await runScript({
        rpcUrl: x1.url,
        configText: "{ epochs: 3 }",
        args: ["--epochs", "1"],
      });
      assert.equal(run.code, 1);
      assert.match(run.stderr, /^Error: config\.json is not valid JSON: /m);
    } finally {
      await x1.close();
    }
  });

  it('checks config.json\'s epochs as a typed --epochs is checked, stopping with exit code 1 on 0, -3 and "two"', async () => {
    const standIns = await startStandIns();
    try {
      for (const epochs of [0, -3, "two"]) {
        const run = await runScript({
          rpcUrl: standIns.x1.url,
          geckoTerminalUrl: standIns.server.url,
          config: { epochs },
          timeoutMs: 60_000,
        });
        assert.equal(run.code, 1, `epochs ${JSON.stringify(epochs)}`);
        assert.match(
          run.stderr,
          /config\.json → epochs must be a whole number above 0, or null for none/,
        );
      }
    } finally {
      await standIns.close();
    }
  });

  it("names every problem in config.json at once, before it asks the chain anything", async () => {
    const run = await runScript({
      rpcUrl: "http://127.0.0.1:1",
      geckoTerminalUrl: "http://127.0.0.1:1",
      config: {
        rpcURL: "https://rpc.mainnet.x1.xyz",
        liquidityPoolAddress: "not-a-key",
        verbose: "yes",
      },
    });
    assert.equal(run.code, 1);
    assert.ok(
      run.stderr.includes(
        [
          "Error: config.json → rpcURL is not a setting this tool reads",
          'config.json → liquidityPoolAddress must be a public key, 32 bytes written in base58; it is "not-a-key"',
          'config.json → verbose must be true or false; it is "yes"\n',
        ].join("\n"),
      ),
      run.stderr,
    );
    assert.doesNotMatch(run.stderr, /ECONNREFUSED/);
  });
});
