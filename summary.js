/**
 * @fileoverview
 * The summary of a run, worked out once for the three places that show it:
 * the console, the analytics csv and the analytics json.
 *
 * Each epoch read has one of three outcomes: a reward; no reward, when the
 * endpoint answers with none for the account, as it does for an epoch
 * before the account began or one it missed; or a failed query. A failed
 * query in epochs 0 to 15 is expected, since X1's chain was rolled back
 * early in its life and its endpoint cannot give the rewards of some of
 * those epochs, epoch 15 among them. The expected epochs are those from the
 * account's first reward on, less those whose query failed.
 *
 * The total XNT is exact to the lamport; the averages are written to six
 * decimal places.
 */

import moment from "moment";
import { formatXnt } from "./xnt-amount.js";

/** The last of the early epochs in which a failed query is expected, after X1's rollback. */
const LAST_EARLY_EPOCH = 15;

/**
 * Counts the epochs read by their outcome. The expected epochs are those
 * from the account's first reward on, less those whose query failed, so an
 * epoch before the account began is not expected.
 *
 * @param {Array<{epoch: number, outcome: string}>} outcomes - Each epoch read, with its outcome
 * @returns {{totalEpochsProcessed: number, failedEpochs: number, lowEpochFailures: number, unexpectedFailures: number, epochsWithoutReward: number, expectedEpochs: number}}
 *   The counts
 */
export function countEpochs(outcomes) {
  const failed = outcomes.filter(({ outcome }) => outcome === "failed");
  const rewarded = outcomes.filter(({ outcome }) => outcome === "reward");
  const firstReward =
    rewarded.length === 0
      ? Infinity
      : Math.min(...rewarded.map(({ epoch }) => epoch));
  const lowEpochFailures = failed.filter(
    ({ epoch }) => epoch <= LAST_EARLY_EPOCH,
  ).length;
  return {
    totalEpochsProcessed: outcomes.length,
    failedEpochs: failed.length,
    lowEpochFailures,
    unexpectedFailures: failed.length - lowEpochFailures,
    epochsWithoutReward: outcomes.filter(({ outcome }) => outcome === "none")
      .length,
    expectedEpochs: outcomes.filter(
      ({ epoch, outcome }) => epoch >= firstReward && outcome !== "failed",
    ).length,
  };
}

/**
 * Writes a share as a percentage, to two decimal places.
 *
 * @param {number} part - The part
 * @param {number} whole - The whole
 * @returns {string} The percentage, or '0.00' when the whole is 0
 */
function percentage(part, whole) {
  return whole > 0 ? ((part / whole) * 100).toFixed(2) : "0.00";
}

/**
 * Writes an average amount of XNT, to six decimal places.
 *
 * @param {string} totalXnt - The total, as `formatXnt` writes it
 * @param {number} count - What it is shared among
 * @returns {string} The average, or 'N/A' when the count is 0
 */
function averageXnt(totalXnt, count) {
  return count > 0 ? (Number(totalXnt) / count).toFixed(6) : "N/A";
}

/**
 * Works out the summary of a run.
 *
 * @param {Array<Object>} rows - The report's rows (`rewardRows`), oldest first; at least one
 * @param {Object} counts - The run's counts of epochs (`countEpochs`)
 * @param {number} counts.totalEpochsProcessed - Epochs queried
 * @param {number} counts.failedEpochs - Queries that failed
 * @param {number} counts.lowEpochFailures - Those in epochs 0 to 15, expected after X1's rollback
 * @param {number} counts.unexpectedFailures - Those in later epochs
 * @param {number} counts.epochsWithoutReward - Epochs answered with no reward for the account
 * @param {number} counts.expectedEpochs - Epochs from the account's first reward on, less the failed queries
 * @returns {Object} The summary
 */
export function summarizeRewards(rows, counts) {
  const firstDate = moment.utc(rows[0].rewardDate).startOf("day");
  const lastDate = moment.utc(rows[rows.length - 1].rewardDate).startOf("day");
  const days = lastDate.diff(firstDate, "days") + 1;
  const totalXnt = formatXnt(rows.reduce((sum, row) => sum + row.lamports, 0n));
  return {
    dateRange: `${firstDate.format("YYYY-MM-DD")} to ${lastDate.format("YYYY-MM-DD")}`,
    days,
    totalXnt,
    averageDailyXnt: averageXnt(totalXnt, days),
    averagePerEpochXnt: averageXnt(totalXnt, rows.length),
    epochsWithRewards: rows.length,
    rewardsWithoutPrice: rows.filter((row) => row.priceUSD === null).length,
    percentageWithRewards: percentage(rows.length, counts.totalEpochsProcessed),
    percentageExpectedWithRewards: percentage(
      rows.length,
      counts.expectedEpochs,
    ),
    ...counts,
  };
}

/**
 * The analytics metrics, in the order the analytics csv and json list them.
 *
 * @param {Object} summary - The summary (`summarizeRewards`)
 * @returns {Array<Array<(string|number)>>} Each metric's name and value
 */
export function analyticsMetrics(summary) {
  return [
    ["Final Date Range (approx)", summary.dateRange],
    ["Days Covered", summary.days],
    ["Total XNT Earned", summary.totalXnt],
    ["Average $XNT Earned Per Day", summary.averageDailyXnt],
    ["Total Epochs Processed", summary.totalEpochsProcessed],
    ["Total Epochs with Rewards", summary.epochsWithRewards],
    ["Epochs Without a Reward", summary.epochsWithoutReward],
    ["Rewards Without an XNT Price", summary.rewardsWithoutPrice],
    ["Percentage of Epochs with Rewards", summary.percentageWithRewards],
    [
      "Percentage of Expected Epochs with Rewards (from the first reward on, less failed queries)",
      summary.percentageExpectedWithRewards,
    ],
    ["Average $XNT Per Epoch", summary.averagePerEpochXnt],
    ["Failed Epoch Queries", summary.failedEpochs],
    ["Unexpected Failed Epoch Queries", summary.unexpectedFailures],
    ["Early Epoch Failures (expected from rollback)", summary.lowEpochFailures],
  ];
}
