/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The script runs in a child process against a stand-in X1 endpoint and a
 * stand-in GeckoTerminal, both served on this computer.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { runScript, VOTE_PUBKEY } from "./helpers/run-script.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { startStandInX1 } from "./helpers/stand-in-x1.js";

describe("fetch-total-validator-earnings.js, reading the last three epochs", () => {
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
      standInGeckoTerminal({ candles: [] }),
    );
    run = await runScript({
      rpcUrl: x1.url,
      geckoTerminalUrl: server.url,
      args: ["--epochs", "3"],
    });
  });

  after(async () => {
    await Promise.all([x1?.close(), server?.close()]);
  });

  knownBug(
    "says it processes the epochs it reads: 499 back to 497 of a chain at epoch 500",
    () => {
      assert.match(
        run.stdout,
        /Processing epochs from 499 back to epoch 497\.\.\.\n/,
      );
    },
  );
});
