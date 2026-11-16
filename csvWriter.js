/**
 * @fileoverview
 * Module for writing CSV files: main per-epoch rewards CSV (with cumulative columns)
 * and separate analytics summary CSV.
 *
 * Exports:
 * - writeMainCsv: Writes main rewards CSV with cumulative XNT/USD columns.
 * - writeAnalyticsCsv: Writes summary metrics CSV.
 *
 * All CSV files include UTF-8 BOM (﻿) for correct opening in LibreOffice/Excel,
 * plus a trailing newline for POSIX compliance. A reward with no XNT price has
 * empty price and value cells.
 */

import { stringify } from 'csv-stringify/sync';
import fs from 'fs';
import { analyticsMetrics } from './summary.js';

/**
 * Writes the main per-epoch rewards CSV with cumulative columns.
 *
 * @param {Array} rows - The report's rows (`rewardRows` in rewards.js), oldest first.
 * @param {string} outputPath - Path to main CSV file.
 */
export function writeMainCsv(rows, outputPath) {
  const columns = [
    'Epoch',
    'Reward Date (UTC, approx)',
    'XNT Amount',
    'Cumulative XNT',
    'XNT Price (USD)',
    'Value (USD)',
    'Cumulative USD'
  ];
  const data = [columns, ...rows.map(r => [
    r.epoch,
    r.rewardDate,
    r.xntAmount,
    r.cumulativeXNT,
    r.priceUSD ?? '',
    r.valueUSD ?? '',
    r.cumulativeUSD
  ])];

  const csvContent = stringify(data);
  fs.writeFileSync(outputPath, '﻿' + csvContent + '\n', 'utf8');

  console.log(`Main CSV written to: ${outputPath} (${rows.length} reward entries)`);
}

/**
 * Writes the summary analytics CSV with all metrics.
 *
 * @param {Object} summary - The run's summary (`summarizeRewards` in summary.js).
 * @param {string} [analyticsPath='xnt_rewards_analytics.csv'] - Path to analytics CSV file.
 */
export function writeAnalyticsCsv(summary, analyticsPath = 'xnt_rewards_analytics.csv') {
  const csvContent = stringify([['Metric', 'Value'], ...analyticsMetrics(summary)]);
  fs.writeFileSync(analyticsPath, '﻿' + csvContent + '\n', 'utf8');

  console.log(`Analytics summary CSV written to: ${analyticsPath}`);
}
