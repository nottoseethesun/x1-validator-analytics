/**
 * Tests of rewards.js and summary.js: the report's rows, and the summary
 * worked out from them.
 * @module test/rewards.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rewardRows } from "../rewards.js";
import { analyticsMetrics, summarizeRewards } from "../summary.js";

const REWARDS = [
  {
    epoch: 497,
    timestamp: Date.UTC(2026, 10, 8, 23, 59, 30) / 1000,
    lamports: 1234567891n,
  },
  {
    epoch: 498,
    timestamp: Date.UTC(2026, 10, 9, 22, 1, 0) / 1000,
    lamports: 2000000000n,
  },
  {
    epoch: 499,
    timestamp: Date.UTC(2026, 10, 10, 20, 2, 0) / 1000,
    lamports: 500000001n,
  },
];

const PRICES = [0.12345678, null, 0.25];

const COUNTS = {
  totalEpochsProcessed: 30,
  failedEpochs: 16,
  lowEpochFailures: 16,
  unexpectedFailures: 0,
  expectedEpochs: 14,
};

describe("rewardRows", () => {
  const rows = rewardRows(REWARDS, PRICES);

  it("writes each date in UTC", () => {
    assert.deepEqual(
      rows.map((row) => row.rewardDate),
      ["2026-11-08 23:59:30", "2026-11-09 22:01:00", "2026-11-10 20:02:00"],
    );
  });

  it("writes each amount and the running total exact to the lamport", () => {
    assert.deepEqual(
      rows.map((row) => row.xntAmount),
      ["1.234567891", "2.000000000", "0.500000001"],
    );
    assert.deepEqual(
      rows.map((row) => row.cumulativeXNT),
      ["1.234567891", "3.234567891", "3.734567892"],
    );
    assert.deepEqual(
      rows.map((row) => row.lamports),
      [1234567891n, 2000000000n, 500000001n],
    );
  });

  it("writes each price to six places, and values the amount at the written price, to four", () => {
    assert.deepEqual(
      rows.map((row) => row.priceUSD),
      ["0.123457", null, "0.250000"],
    );
    // 1.234567891 × 0.123457 = 0.15241604…, and 0.500000001 × 0.25 = 0.12500000…
    assert.deepEqual(
      rows.map((row) => row.valueUSD),
      ["0.1524", null, "0.1250"],
    );
  });

  it("adds the values as written to the running USD total, leaving out a reward with no price", () => {
    assert.deepEqual(
      rows.map((row) => row.cumulativeUSD),
      ["0.1524", "0.1524", "0.2774"],
    );
  });
});

describe("summarizeRewards", () => {
  const summary = summarizeRewards(rewardRows(REWARDS, PRICES), COUNTS);

  it("gives the UTC days the rewards span", () => {
    assert.equal(summary.dateRange, "2026-11-08 to 2026-11-10");
    assert.equal(summary.days, 3);
  });

  it("totals the XNT exactly, and averages it per day and per reward to six places", () => {
    assert.equal(summary.totalXnt, "3.734567892");
    assert.equal(summary.averageDailyXnt, "1.244856");
    assert.equal(summary.averagePerEpochXnt, "1.244856");
  });

  it("counts the rewards with no price", () => {
    assert.equal(summary.rewardsWithoutPrice, 1);
  });

  it("gives the shares of the epochs with rewards, and passes the counts on", () => {
    assert.equal(summary.epochsWithRewards, 3);
    assert.equal(summary.percentageWithRewards, "10.00");
    assert.equal(summary.percentageExpectedWithRewards, "21.43");
    assert.equal(summary.lowEpochFailures, 16);
    assert.equal(summary.unexpectedFailures, 0);
  });

  it("totals exactly past the largest whole number a float holds", () => {
    const large = rewardRows(
      [
        {
          epoch: 1,
          timestamp: REWARDS[0].timestamp,
          lamports: 9007199254740993n,
        },
        { epoch: 2, timestamp: REWARDS[1].timestamp, lamports: 1n },
      ],
      [null, null],
    );
    assert.equal(summarizeRewards(large, COUNTS).totalXnt, "9007199.254740994");
  });
});

describe("analyticsMetrics", () => {
  const metrics = analyticsMetrics(
    summarizeRewards(rewardRows(REWARDS, PRICES), COUNTS),
  );

  it("starts with the date range, and gives the exact total and the count of rewards with no price", () => {
    assert.deepEqual(metrics[0], [
      "Final Date Range (approx)",
      "2026-11-08 to 2026-11-10",
    ]);
    assert.deepEqual(
      metrics.find(([name]) => name === "Total XNT Earned"),
      ["Total XNT Earned", "3.734567892"],
    );
    assert.deepEqual(
      metrics.find(([name]) => name === "Rewards Without an XNT Price"),
      ["Rewards Without an XNT Price", 1],
    );
  });
});
