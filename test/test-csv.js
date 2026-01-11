/**
 * @fileoverview
 * Simple standalone test script to verify csv-stringify ESM import and basic CSV generation.
 * Intended to be run from project root with:
 *   node test/test-csv.js
 *
 * Creates a file test-output.csv in the current directory (project root).
 *
 * @usage
 * node test/test-csv.js
 *
 * Expected outcome:
 * - Console message "CSV test file created successfully"
 * - File test-output.csv appears with sample data
 */

import { stringify } from 'csv-stringify/sync';
import fs from 'fs';

function main() {
  const sampleData = [
    ['Name', 'Age', 'City'],
    ['Alice', 30, 'New York'],
    ['Bob', 25, 'San Francisco'],
    ['Charlie', 42, 'Austin']
  ];

  try {
    const csvContent = stringify(sampleData);
    fs.writeFileSync('test-output.csv', csvContent, 'utf8');
    console.log('CSV test file created successfully: test-output.csv');
  } catch (err) {
    console.error('Failed to create test CSV:', err.message);
    process.exit(1);
  }
}

main();
