/**
 * Tests of the known bugs, each declared with `knownBug`: a test passes
 * while its bug is present, and fails once the bug is fixed, the cue to
 * declare it with `it` among the tests of the code it is about (see
 * `../CLAUDE.md`).
 * @module test/known-bugs.test
 *
 * The script runs in a child process against a stand-in X1 endpoint and a
 * stand-in GeckoTerminal, as in `fetch-total-validator-earnings.test.js`.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { startStandInX1 } from "./helpers/stand-in-x1.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { runScript, VOTE_PUBKEY } from "./helpers/run-script.js";
import { knownBug } from "./helpers/known-bug.js";

/**
 * Asks a json-rpc endpoint for its epoch, as the script does.
 *
 * @param {string} url - The endpoint's url
 * @returns {Promise<{absoluteSlot: number, slotIndex: number}>} The answer to getEpochInfo
 */
async function epochInfo(url) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getEpochInfo" }),
  });
  return (await response.json()).result;
}

describe("fetch-total-validator-earnings.js, in verbose mode", () => {
  let x1;
  let server;
  let run;

  before(async () => {
    x1 = await startStandInX1({
      votePubkey: VOTE_PUBKEY,
      rewardLamports: 1234567891,
      nowSeconds: Date.UTC(2026, 10, 10, 12, 0, 0) / 1000,
    });
    server = await serveStandInGeckoTerminal(
      standInGeckoTerminal({ candles: [], refusals: [500] }),
    );
    run = await runScript({
      rpcUrl: x1.url,
      geckoTerminalUrl: server.url,
      args: ["--epochs", "1", "--verbose"],
    });
  });

  after(async () => {
    await Promise.all([x1?.close(), server?.close()]);
  });

  knownBug(
    "prints the current epoch's first slot, its absolute slot less its index in the epoch",
    async () => {
      assert.equal(run.code, 0, run.stderr);
      const { absoluteSlot, slotIndex } = await epochInfo(x1.url);
      assert.ok(
        run.stdout.includes(`Epoch Start Slot: ${absoluteSlot - slotIndex}\n`),
        run.stdout,
      );
    },
  );
});
