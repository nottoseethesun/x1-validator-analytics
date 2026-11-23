/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { knownBug } from "./helpers/known-bug.js";
import { startStandInX1 } from "./helpers/stand-in-x1.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./helpers/stand-in-gecko-terminal.js";
import { runScript, VOTE_PUBKEY } from "./helpers/run-script.js";

/** The stand-in chain's time: 12:00 UTC on 2026-11-10. */
const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

/**
 * Why the tests that need a folder that takes no new file are skipped, or
 * false: they use /proc, a folder of Linux's that takes no new file even
 * from root, whom no folder's modes stop.
 */
const NO_PROC = !fs.existsSync("/proc") && "this system has no /proc";

describe("fetch-total-validator-earnings.js, with a file it cannot write", () => {
  let x1;
  let gecko;

  before(async () => {
    x1 = await startStandInX1({
      votePubkey: VOTE_PUBKEY,
      rewardLamports: 1234567891,
      nowSeconds: NOW_SECONDS,
      currentEpoch: 20,
    });
    const candles = [];
    const firstHour = Math.floor((NOW_SECONDS - 30 * 86400) / 3600) * 3600;
    for (let open = firstHour; open <= NOW_SECONDS; open += 3600)
      candles.push([open, 0.2]);
    gecko = await serveStandInGeckoTerminal(standInGeckoTerminal({ candles }));
  });

  after(async () => {
    if (x1 !== undefined) await x1.close();
    if (gecko !== undefined) await gecko.close();
  });

  knownBug(
    "refuses an --output that is a folder, naming --output, before it asks the chain for any reward's time",
    async () => {
      const folder = fs.mkdtempSync(`${os.tmpdir()}/x1-output-folder-`);
      try {
        const asksBefore = x1.chain.blockTimeAsks;
        const run = await runScript({
          rpcUrl: x1.url,
          geckoTerminalUrl: gecko.url,
          args: ["--output", folder],
        });
        assert.equal(run.code, 1);
        assert.ok(
          run.stderr.includes(
            `option '-o, --output <file>' argument '${folder}' is invalid: it is a folder, not a file.`,
          ),
          run.stderr,
        );
        assert.equal(x1.chain.blockTimeAsks, asksBefore);
      } finally {
        fs.rmSync(folder, { recursive: true, force: true });
      }
    },
  );

  describe("in /proc, which takes no new file", { skip: NO_PROC }, () => {
    knownBug(
      "refuses an --output whose folder takes no new file, naming --output, before it asks the chain for any reward's time",
      async () => {
        const asksBefore = x1.chain.blockTimeAsks;
        const run = await runScript({
          rpcUrl: x1.url,
          geckoTerminalUrl: gecko.url,
          args: ["--output", "/proc/x1-validator-analytics-test.csv"],
        });
        assert.equal(run.code, 1);
        assert.ok(
          run.stderr.includes(
            "option '-o, --output <file>' argument '/proc/x1-validator-analytics-test.csv' is invalid: its folder, /proc, takes no new file",
          ),
          run.stderr,
        );
        assert.equal(x1.chain.blockTimeAsks, asksBefore);
      },
    );

    knownBug(
      "refuses a run whose output/csv/, where it writes the summary, takes no new file, before it asks the chain for any reward's time",
      async () => {
        const asksBefore = x1.chain.blockTimeAsks;
        const run = await runScript({
          rpcUrl: x1.url,
          geckoTerminalUrl: gecko.url,
          folders: ["output/json"],
          links: { "output/csv": "/proc" },
        });
        assert.equal(run.code, 1);
        assert.match(
          run.stderr,
          /writes the summary to output\/csv\/xnt_rewards_analytics\.csv, in the folder it runs in, and its folder, .*, takes no new file/,
        );
        assert.equal(x1.chain.blockTimeAsks, asksBefore);
      },
    );
  });
});
