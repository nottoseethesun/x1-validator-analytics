/**
 * @fileoverview
 * Module for exporting full data as JSON file when --json flag is set.
 * Also exports a separate analytics JSON mirroring xnt_rewards_analytics.csv.
 * A reward with no XNT price has a price and value of null.
 */

import fs from "fs";
import { analyticsMetrics } from "./summary.js";

/**
 * Writes full data as JSON files if exportJson is true.
 *
 * @param {Array} rows - The report's rows (`rewardRows` in rewards.js), oldest first.
 * @param {Object} summary - The run's summary (`summarizeRewards` in summary.js).
 * @param {Object} chain - What the chain said about the vote account.
 * @param {number} chain.currentEpoch - Current chain epoch.
 * @param {number} chain.activationEpoch - Approx activation epoch.
 * @param {boolean} exportJson - Whether to write JSON (from --json flag).
 */
export function writeJsonExport(
  rows,
  summary,
  { currentEpoch, activationEpoch },
  exportJson,
) {
  if (!exportJson) return;

  // 1. Full data JSON (xnt_rewards.json)
  const fullJsonData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      currentEpoch,
      activationEpochApprox: activationEpoch,
      totalEpochsProcessed: summary.totalEpochsProcessed,
      failedEpochs: summary.failedEpochs,
      lowEpochFailures: summary.lowEpochFailures,
      unexpectedFailures: summary.unexpectedFailures,
      expectedEpochs: summary.expectedEpochs,
      epochsWithRewards: summary.epochsWithRewards,
      rewardsWithoutPrice: summary.rewardsWithoutPrice,
      percentageWithRewards: summary.percentageWithRewards,
      percentageExpectedWithRewards: summary.percentageExpectedWithRewards,
    },
    summary: {
      dateRangeApprox: summary.dateRange,
      daysCovered: summary.days,
      totalXNTEarned: summary.totalXnt,
      averageDailyXNT: summary.averageDailyXnt,
      averagePerEpochXNT: summary.averagePerEpochXnt,
      percentageOfExpectedEpochsWithRewards:
        summary.percentageExpectedWithRewards +
        "% (accounts for early chain rollback)",
      unexpectedFailedEpochQueries:
        summary.unexpectedFailures + " (outside expected early range)",
      failedEpochQueriesDueToRollback: summary.failedEpochs,
      earlyEpochFailuresExpectedFromRollback: summary.lowEpochFailures,
    },
    rewards: rows.map((r) => ({
      epoch: r.epoch,
      rewardDate: r.rewardDate,
      xntAmount: r.xntAmount,
      cumulativeXNT: r.cumulativeXNT,
      priceUSD: r.priceUSD,
      valueUSD: r.valueUSD,
      cumulativeUSD: r.cumulativeUSD,
    })),
  };

  const fullJsonPath = "xnt_rewards.json";
  fs.writeFileSync(fullJsonPath, JSON.stringify(fullJsonData, null, 2) + "\n");
  console.log(`Full JSON export written to: ${fullJsonPath}`);

  // 2. Analytics-only JSON (xnt_rewards_analytics.json) - exact mirror of CSV
  const analyticsData = analyticsMetrics(summary).map(([Metric, Value]) => ({
    Metric,
    Value,
  }));

  const analyticsJsonPath = "xnt_rewards_analytics.json";
  fs.writeFileSync(
    analyticsJsonPath,
    JSON.stringify(analyticsData, null, 2) + "\n",
  );
  console.log(`Analytics JSON export written to: ${analyticsJsonPath}`);
}
