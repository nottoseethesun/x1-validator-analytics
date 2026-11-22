/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The real script runs in a child process (`helpers/run-script.js`),
 * against a stand-in X1 endpoint and a stand-in GeckoTerminal, so the tests
 * ask nothing outside the computer.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { startStandInX1 } from "./helpers/stand-in-x1.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { runScript, VOTE_PUBKEY } from "./helpers/run-script.js";

/** The stand-in chain's time: 12:00 UTC on 2026-11-10. */
const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

describe("fetch-total-validator-earnings.js, its known bugs", () => {
  knownBug(
    "stops with exit code 1, naming the epoch, when the chain gives no block time for a reward",
    async () => {
      const x1 = await startStandInX1({
        votePubkey: VOTE_PUBKEY,
        rewardLamports: 1234567891,
        nowSeconds: NOW_SECONDS,
        failBlockTimes: true,
      });
      const server = await serveStandInGeckoTerminal(
        standInGeckoTerminal({ candles: [] }),
      );
      try {
        const run = await runScript({
          rpcUrl: x1.url,
          geckoTerminalUrl: server.url,
          args: ["--epochs", "1"],
        });
        assert.equal(run.code, 1);
        assert.match(run.stderr, /epoch 499/);
      } finally {
        await Promise.all([x1.close(), server.close()]);
      }
    },
  );

  knownBug(
    "refuses an empty --output as it parses, naming the option, before it asks anything",
    async () => {
      const run = await runScript({
        rpcUrl: "http://127.0.0.1:1",
        geckoTerminalUrl: "http://127.0.0.1:1",
        args: ["--output", ""],
      });
      assert.equal(run.code, 1);
      assert.match(run.stderr, /argument '' is invalid/);
      assert.ok(run.stderr.includes("--output <file>"), run.stderr);
    },
  );

  knownBug(
    "answers --help with exit code 0 in a folder whose config.json is refused",
    async () => {
      const run = await runScript({
        rpcUrl: "http://127.0.0.1:1",
        config: { requestTimeoutSeconds: 0 },
        args: ["--help"],
      });
      assert.equal(run.code, 0);
      assert.match(run.stdout, /^Usage: /m);
    },
  );
});
