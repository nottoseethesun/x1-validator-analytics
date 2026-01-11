/**
 * @fileoverview
 * Module for exporting full data as JSON file when --json flag is set.
 * Now also exports a separate analytics JSON mirroring xnt_rewards_analytics.csv.
 */

import fs from 'fs';
import moment from 'moment';

/**
 * Writes full data as JSON files if exportJson is true.
 *
 * @param {Array} rewards - Array of reward objects.
 * @param {number} totalEpochsProcessed - Total epochs queried.
 * @param {number} failedEpochs - Total failed queries.
 * @param {number} lowEpochFailures - Failed queries in early epochs (<=15).
 * @param {number} unexpectedFailures - Failed queries outside early range.
 * @param {number} expectedEpochs - Epochs expected to be queryable (processed - low failures).
 * @param {number} currentEpoch - Current chain epoch.
 * @param {number} activationEpoch - Approx activation epoch.
 * @param {boolean} exportJson - Whether to write JSON (from --json flag).
 */
export function writeJsonExport(rewards, totalEpochsProcessed, failedEpochs, lowEpochFailures, unexpectedFailures, expectedEpochs, currentEpoch, activationEpoch, exportJson) {
  if (!exportJson) return;

  const firstDate = rewards.length > 0 ? moment(rewards[0].rewardDate).startOf('day').format('YYYY-MM-DD') : 'N/A';
  const lastDate = rewards.length > 0 ? moment(rewards[rewards.length - 1].rewardDate).startOf('day').format('YYYY-MM-DD') : 'N/A';
  const days = rewards.length > 0 ? moment(lastDate).diff(firstDate, 'days') + 1 : 0;
  const totalXNT = rewards.reduce((sum, r) => sum + parseFloat(r.xntAmount), 0);
  const avgDaily = days > 0 ? (totalXNT / days).toFixed(6) : 'N/A';
  const totalEpochsWithRewards = rewards.length;
  const percentageWithRewards = totalEpochsProcessed > 0 ? ((totalEpochsWithRewards / totalEpochsProcessed) * 100).toFixed(2) : '0.00';
  const percentageExpectedWithRewards = expectedEpochs > 0 ? ((totalEpochsWithRewards / expectedEpochs) * 100).toFixed(2) : '0.00';
  const avgPerEpoch = totalEpochsWithRewards > 0 ? (totalXNT / totalEpochsWithRewards).toFixed(6) : 'N/A';

  // 1. Full data JSON (xnt_rewards.json) - same as before
  const fullJsonData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      currentEpoch,
      activationEpochApprox: activationEpoch,
      totalEpochsProcessed,
      failedEpochs,
      lowEpochFailures,
      unexpectedFailures,
      expectedEpochs,
      epochsWithRewards: totalEpochsWithRewards,
      percentageWithRewards,
      percentageExpectedWithRewards
    },
    summary: {
      dateRangeApprox: `${firstDate} to ${lastDate}`,
      daysCovered: days,
      totalXNTEarned: totalXNT.toFixed(6),
      averageDailyXNT: avgDaily,
      averagePerEpochXNT: avgPerEpoch,
      percentageOfExpectedEpochsWithRewards: percentageExpectedWithRewards + '% (accounts for early chain rollback)',
      unexpectedFailedEpochQueries: unexpectedFailures + ' (outside expected early range)',
      failedEpochQueriesDueToRollback: failedEpochs,
      earlyEpochFailuresExpectedFromRollback: lowEpochFailures
    },
    rewards: rewards.map(r => ({
      epoch: r.epoch,
      rewardDate: r.rewardDate,
      xntAmount: r.xntAmount,
      cumulativeXNT: r.cumulativeXNT || 'N/A',
      priceUSD: r.priceUSD,
      valueUSD: r.valueUSD,
      cumulativeUSD: r.cumulativeUSD || 'N/A'
    }))
  };

  const fullJsonPath = 'xnt_rewards.json';
  fs.writeFileSync(fullJsonPath, JSON.stringify(fullJsonData, null, 2) + '\n');
  console.log(`Full JSON export written to: ${fullJsonPath}`);

  // 2. Analytics-only JSON (xnt_rewards_analytics.json) - exact mirror of CSV
  const analyticsData = [
    { Metric: 'Final Date Range (approx)', Value: `${firstDate} to ${lastDate}` },
    { Metric: 'Days Covered', Value: days },
    { Metric: 'Total XNT Earned', Value: totalXNT.toFixed(6) },
    { Metric: 'Average $XNT Earned Per Day', Value: avgDaily },
    { Metric: 'Total Epochs Processed', Value: totalEpochsProcessed },
    { Metric: 'Total Epochs with Rewards', Value: totalEpochsWithRewards },
    { Metric: 'Percentage of Epochs with Rewards', Value: percentageWithRewards },
    { Metric: 'Percentage of Expected Epochs with Rewards (accounts for early chain rollback)', Value: percentageExpectedWithRewards },
    { Metric: 'Average $XNT Per Epoch', Value: avgPerEpoch },
    { Metric: 'Unexpected Failed Epoch Queries', Value: unexpectedFailures },
    { Metric: 'Failed Epoch Queries (due to early X1 chain roll-back - see Unexpected failed epoch queries)', Value: failedEpochs },
    { Metric: 'Early Epoch Failures (expected from rollback)', Value: lowEpochFailures }
  ];

  const analyticsJsonPath = 'xnt_rewards_analytics.json';
  fs.writeFileSync(analyticsJsonPath, JSON.stringify(analyticsData, null, 2) + '\n');
  console.log(`Analytics JSON export written to: ${analyticsJsonPath}`);
}
