/**
 * @fileoverview
 * Module for writing CSV files: main per-epoch rewards CSV (with cumulative columns)
 * and separate analytics summary CSV.
 *
 * Exports:
 * - writeMainCsv: Writes main rewards CSV with cumulative XNT/USD columns.
 * - writeAnalyticsCsv: Writes summary metrics CSV.
 *
 * All CSV files include UTF-8 BOM (\uFEFF) for correct opening in LibreOffice/Excel,
 * plus a trailing newline for POSIX compliance.
 */

import { stringify } from 'csv-stringify/sync';
import fs from 'fs';
import moment from 'moment';

/**
 * Writes the main per-epoch rewards CSV with cumulative columns.
 *
 * @param {Array} rewards - Array of reward objects.
 * @param {string} outputPath - Path to main CSV file.
 */
export function writeMainCsv(rewards, outputPath) {
  let cumulativeXNT = 0;
  let cumulativeUSD = 0;
  const rowsWithCumulative = rewards.map(r => {
    cumulativeXNT += parseFloat(r.xntAmount);
    cumulativeUSD += parseFloat(r.valueUSD);
    return {
      ...r,
      cumulativeXNT: cumulativeXNT.toFixed(6),
      cumulativeUSD: cumulativeUSD.toFixed(4)
    };
  });

  const columns = [
    'Epoch',
    'Reward Date (UTC, approx)',
    'XNT Amount',
    'Cumulative XNT',
    'XNT Price (USD)',
    'Value (USD)',
    'Cumulative USD'
  ];
  const data = [columns, ...rowsWithCumulative.map(r => [
    r.epoch,
    r.rewardDate,
    r.xntAmount,
    r.cumulativeXNT,
    r.priceUSD,
    r.valueUSD,
    r.cumulativeUSD
  ])];

  const csvContent = stringify(data);
  fs.writeFileSync(outputPath, '\uFEFF' + csvContent + '\n', 'utf8');

  console.log(`Main CSV written to: ${outputPath} (${rewards.length} reward entries)`);
}

/**
 * Writes the summary analytics CSV with all metrics.
 *
 * @param {Array} rewards - Array of reward objects.
 * @param {number} totalEpochsProcessed - Total epochs queried.
 * @param {number} failedEpochs - Total failed queries.
 * @param {number} lowEpochFailures - Failed queries in early epochs (<=15).
 * @param {number} unexpectedFailures - Failed queries outside early range.
 * @param {number} expectedEpochs - Epochs expected to be queryable (processed - low failures).
 * @param {string} [analyticsPath='xnt_rewards_analytics.csv'] - Path to analytics CSV file.
 */
export function writeAnalyticsCsv(rewards, totalEpochsProcessed, failedEpochs, lowEpochFailures, unexpectedFailures, expectedEpochs, analyticsPath = 'xnt_rewards_analytics.csv') {
  if (rewards.length === 0) return;

  const firstDate = moment(rewards[0].rewardDate).startOf('day');
  const lastDate = moment(rewards[rewards.length - 1].rewardDate).startOf('day');
  const days = lastDate.diff(firstDate, 'days') + 1;
  const totalXNT = rewards.reduce((sum, r) => sum + parseFloat(r.xntAmount), 0);
  const avgDaily = days > 0 ? (totalXNT / days).toFixed(6) : 'N/A';
  const totalEpochsWithRewards = rewards.length;
  const percentageWithRewards = totalEpochsProcessed > 0 ? ((totalEpochsWithRewards / totalEpochsProcessed) * 100).toFixed(2) : '0.00';
  const percentageExpectedWithRewards = expectedEpochs > 0 ? ((totalEpochsWithRewards / expectedEpochs) * 100).toFixed(2) : '0.00';
  const avgPerEpoch = totalEpochsWithRewards > 0 ? (totalXNT / totalEpochsWithRewards).toFixed(6) : 'N/A';

  const analyticsData = [
    ['Metric', 'Value'],
    ['Final Date Range (approx)', `${firstDate.format('YYYY-MM-DD')} to ${lastDate.format('YYYY-MM-DD')}`],
    ['Days Covered', days],
    ['Total XNT Earned', totalXNT.toFixed(6)],
    ['Average $XNT Earned Per Day', avgDaily],
    ['Total Epochs Processed', totalEpochsProcessed],
    ['Total Epochs with Rewards', totalEpochsWithRewards],
    ['Percentage of Epochs with Rewards', percentageWithRewards],
    ['Percentage of Expected Epochs with Rewards (accounts for early chain rollback)', percentageExpectedWithRewards],
    ['Average $XNT Per Epoch', avgPerEpoch],
    ['Unexpected Failed Epoch Queries', unexpectedFailures],
    ['Failed Epoch Queries (due to early X1 chain roll-back - see Unexpected failed epoch queries)', failedEpochs],
    ['Early Epoch Failures (expected from rollback)', lowEpochFailures]
  ];

  const csvContent = stringify(analyticsData);
  fs.writeFileSync(analyticsPath, '\uFEFF' + csvContent + '\n', 'utf8');

  console.log(`Analytics summary CSV written to: ${analyticsPath}`);
}
