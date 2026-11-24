/**
 * Tests of reports/csvWriter.js, the writers of the rewards CSV and the analytics
 * CSV.
 * @module test/csv-writer.test
 *
 * The writers write into a temp folder of the test's own, removed
 * afterwards.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeAnalyticsCsv, writeMainCsv } from "../reports/csvWriter.js";
import { rewardRows } from "../rewards/rewards.js";
import { analyticsMetrics, summarizeRewards } from "../reports/summary.js";

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
    path.join(os.tmpdir(), "x1-validator-analytics-test-csv-writer-"),
  );
});

after(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

describe("the CSV files", () => {
  it("start each with a UTF-8 BOM and end it with one newline, after the last row, so no row is empty", () => {
    const rows = rewardRows(REWARDS, [0.144013]);
    const main = path.join(folder, "main.csv");
    const analytics = path.join(folder, "analytics.csv");
    writeMainCsv(rows, main);
    writeAnalyticsCsv(summarizeRewards(rows, COUNTS), analytics);
    for (const file of [main, analytics]) {
      const text = fs.readFileSync(file, "utf8");
      assert.ok(text.startsWith("\uFEFF"), `${file} starts with no BOM`);
      assert.ok(text.endsWith("\n"), `${file} ends with no newline`);
      assert.ok(!text.endsWith("\n\n"), `${file} ends with an empty row`);
    }
  });
});

describe("the reward dates' labels", () => {
  it("name the reward dates, the block times the chain gives, with no approx", () => {
    const rows = rewardRows(REWARDS, [0.144013]);
    const main = path.join(folder, "labels.csv");
    writeMainCsv(rows, main);
    const header = fs.readFileSync(main, "utf8").split("\n")[0];
    assert.equal(
      header,
      "\uFEFFEpoch,Reward Date (UTC),XNT Amount,Cumulative XNT,XNT Price (USD),Value (USD),Cumulative USD",
    );
    assert.equal(
      analyticsMetrics(summarizeRewards(rows, COUNTS))[0][0],
      "Final Date Range",
    );
  });
});
