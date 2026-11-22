/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { knownBug } from "./helpers/known-bug.js";
import { writeMainCsv } from "../csvWriter.js";
import { rewardRows } from "../rewards.js";
import { analyticsMetrics, summarizeRewards } from "../summary.js";

describe("the reward dates' labels", () => {
  knownBug(
    "name the reward dates, the block times the chain gives, with no approx",
    () => {
      const folder = fs.mkdtempSync(
        path.join(os.tmpdir(), "x1-validator-analytics-test-known-bugs-"),
      );
      try {
        const rows = rewardRows(
          [
            {
              epoch: 497,
              timestamp: Date.UTC(2026, 10, 8, 23, 59, 30) / 1000,
              lamports: 1234567891n,
            },
          ],
          [0.144013],
        );
        const main = path.join(folder, "main.csv");
        writeMainCsv(rows, main);
        const header = fs.readFileSync(main, "utf8").split("\n")[0];
        const summary = summarizeRewards(rows, {
          totalEpochsProcessed: 1,
          failedEpochs: 0,
          lowEpochFailures: 0,
          unexpectedFailures: 0,
          epochsWithoutReward: 0,
          expectedEpochs: 1,
        });
        assert.doesNotMatch(header, /approx/);
        assert.doesNotMatch(analyticsMetrics(summary)[0][0], /approx/);
      } finally {
        fs.rmSync(folder, { recursive: true, force: true });
      }
    },
  );
});
