/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The CSV writers, `csvWriter.js`, write into a temp folder of the test's
 * own, removed afterwards.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAnalyticsCsv, writeMainCsv } from "../csvWriter.js";
import { rewardRows } from "../rewards.js";
import { summarizeRewards } from "../summary.js";
import { knownBug } from "./helpers/known-bug.js";

/** One reward, and the counts of a run that queried its epoch alone. */
const REWARDS = [
  {
    epoch: 497,
    timestamp: Date.UTC(2026, 10, 8, 23, 59, 30) / 1000,
    lamports: 1234567891n,
  },
];
const COUNTS = {
  totalEpochsProcessed: 1,
  failedEpochs: 0,
  lowEpochFailures: 0,
  unexpectedFailures: 0,
  epochsWithoutReward: 0,
  expectedEpochs: 1,
};

let folder;

before(() => {
  folder = fs.mkdtempSync(
    path.join(os.tmpdir(), "x1-validator-analytics-test-known-bugs-"),
  );
});

after(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe("the CSV files", () => {
  knownBug(
    "end each with one newline, after the last row, so no row is empty",
    () => {
      const rows = rewardRows(REWARDS, [0.144013]);
      const main = path.join(folder, "main.csv");
      const analytics = path.join(folder, "analytics.csv");
      writeMainCsv(rows, main);
      writeAnalyticsCsv(summarizeRewards(rows, COUNTS), analytics);
      for (const file of [main, analytics]) {
        const text = fs.readFileSync(file, "utf8");
        assert.ok(text.endsWith("\n"), `${file} ends with no newline`);
        assert.ok(!text.endsWith("\n\n"), `${file} ends with an empty row`);
      }
    },
  );
});
