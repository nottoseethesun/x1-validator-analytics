const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const { parse } = require('csv-parse/sync');

const execPromise = util.promisify(exec);

const MAIN_SCRIPT = '../fetch-total-validator-earnings.js';
const FIXED_VOTE_PUBKEY = 'Ce5RppixDArjtH588uXMCryNYcAtbNqaWncY4tBCdYUs';
const MAIN_CSV_FILENAME = 'xnt_rewards_with_prices.csv';

async function runScript(args = []) {
  const fullArgs = ['--vote-pubkey', FIXED_VOTE_PUBKEY, ...args];
  const cmd = `node ${MAIN_SCRIPT} ${fullArgs.join(' ')}`;

  try {
    const { stdout, stderr } = await execPromise(cmd);
    return { stdout, stderr, code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      code: err.code || 1
    };
  }
}

async function fileExists(path) {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

function readCsv(path) {
  const content = fs.readFileSync(path, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

module.exports = {
  runScript,
  fileExists,
  readCsv,
  MAIN_CSV_FILENAME
};
