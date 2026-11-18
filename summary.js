/**
 * @fileoverview
 * The summary of a run, worked out once for the three places that show it:
 * the console, the analytics csv and the analytics json.
 *
 * The total XNT is exact to the lamport; the averages are written to six
 * decimal places.
 */

import moment from "moment";
import { formatXnt } from "./xnt-amount.js";

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
 * @param {Object} counts - The run's counts of epochs
 * @param {number} counts.totalEpochsProcessed - Epochs queried
 * @param {number} counts.failedEpochs - Queries that gave no reward
 * @param {number} counts.lowEpochFailures - Those in epochs 0 to 15, expected after X1's rollback
 * @param {number} counts.unexpectedFailures - Those in later epochs
 * @param {number} counts.expectedEpochs - Epochs expected to answer: those queried, less the early failures
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
    ["Rewards Without an XNT Price", summary.rewardsWithoutPrice],
    ["Percentage of Epochs with Rewards", summary.percentageWithRewards],
    [
      "Percentage of Expected Epochs with Rewards (accounts for early chain rollback)",
      summary.percentageExpectedWithRewards,
    ],
    ["Average $XNT Per Epoch", summary.averagePerEpochXnt],
    ["Unexpected Failed Epoch Queries", summary.unexpectedFailures],
    [
      "Failed Epoch Queries (due to early X1 chain roll-back - see Unexpected failed epoch queries)",
      summary.failedEpochs,
    ],
    ["Early Epoch Failures (expected from rollback)", summary.lowEpochFailures],
  ];
}
