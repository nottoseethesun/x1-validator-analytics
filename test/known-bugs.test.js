/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The script runs in a child process against a stand-in X1 endpoint and a
 * stand-in GeckoTerminal, both served on this computer.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { runScript, VOTE_PUBKEY } from "./helpers/run-script.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { startStandInX1 } from "./helpers/stand-in-x1.js";

/** The stand-in chain's time: 12:00 UTC on 2026-11-10. */
const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

describe("fetch-total-validator-earnings.js, with a config.json it cannot take", () => {
  knownBug(
    "stops with exit code 1, naming the file, when config.json is not JSON",
    async () => {
      // No epoch pays the account, so a run on the defaults asks no
      // GeckoTerminal, and --rpc-url keeps it on the stand-in chain.
      const x1 = await startStandInX1({
        votePubkey: VOTE_PUBKEY,
        rewardLamports: 1234567891,
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
        assert.match(run.stderr, /config\.json is not valid JSON/);
      } finally {
        await x1.close();
      }
    },
  );

  knownBug(
    'checks config.json\'s epochs as a typed --epochs is checked, stopping with exit code 1 on 0, -3 and "two"',
    async () => {
      const x1 = await startStandInX1({
        votePubkey: VOTE_PUBKEY,
        rewardLamports: 1234567891,
        nowSeconds: NOW_SECONDS,
      });
      const server = await serveStandInGeckoTerminal(
        standInGeckoTerminal({ candles: [] }),
      );
      try {
        for (const epochs of [0, -3, "two"]) {
          const run = await runScript({
            rpcUrl: x1.url,
            geckoTerminalUrl: server.url,
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
        await Promise.all([x1.close(), server.close()]);
      }
    },
  );
});
