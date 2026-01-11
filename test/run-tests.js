// run-tests.js - Fixed basic test check for 0 failures
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');

const execPromise = util.promisify(exec);

const SCRIPT = path.join(__dirname, '..', 'fetch-total-validator-earnings.js');
const VOTE = 'Ce5RppixDArjtH588uXMCryNYcAtbNqaWncY4tBCdYUs';

const tests = [
  {
    name: 'Basic 4-epoch run',
    cmd: `node "${SCRIPT}" --vote-pubkey ${VOTE} --epochs 4`,
    checks: [
      { desc: 'Command executed successfully', fn: r => r.success },
      { desc: 'Main CSV mentions 4 reward entries', fn: r => r.stdout.includes('(4 reward entries)') },
      { desc: 'Analytics CSV exists and has Days Covered = 4', fn: async () => {
        if (!await fileExists('xnt_rewards_analytics.csv')) return false;
        const csv = await readCsv('xnt_rewards_analytics.csv');
        const daysRow = csv.find(row => row[0]?.trim() === 'Days Covered');
        return daysRow && daysRow[1]?.trim() === '4';
      } },
      { desc: 'No unexpected failures in output', fn: r => r.stdout.includes('Unexpected failed epoch queries: 0') },
      { desc: 'Main CSV written message present', fn: r => r.stdout.includes('Main CSV written to') },
      { desc: 'Analytics CSV written message present', fn: r => r.stdout.includes('Analytics summary CSV written to') }
    ]
  },

  {
    name: 'JSON export (--json --epochs 4)',
    cmd: `node "${SCRIPT}" --vote-pubkey ${VOTE} --epochs 4 --json`,
    checks: [
      { desc: 'Command executed successfully', fn: r => r.success },
      { desc: 'xnt_rewards.json exists', fn: async () => await fileExists('xnt_rewards.json') },
      { desc: 'xnt_rewards_analytics.json exists', fn: async () => await fileExists('xnt_rewards_analytics.json') },
      { desc: 'rewards array has 4 entries', fn: async () => {
        const json = await readJson('xnt_rewards.json');
        return json.rewards?.length === 4;
      } }
    ],
    cleanup: async () => {
      await fs.unlink('xnt_rewards.json').catch(() => {});
      await fs.unlink('xnt_rewards_analytics.json').catch(() => {});
    }
  },

  {
    name: 'Full history (expect ~99 rewards + 15 early failures)',
    cmd: `node "${SCRIPT}" --vote-pubkey ${VOTE}`,
    checks: [
      { desc: 'Command executed successfully', fn: r => r.success },
      { desc: '99 reward entries', fn: r => r.stdout.match(/\(99 reward entries\)/) },
      { desc: '15 failed queries', fn: r => r.stdout.match(/Failed epoch queries.*15/) },
      { desc: 'Rollback note present', fn: r => r.stdout.includes('Note: 15 failures in early epochs (<=15) are expected') }
    ]
  }
];

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

async function readCsv(p) {
  try {
    const content = await fs.readFile(p, 'utf8');
    return content.split('\n').map(splitCsvLine);
  } catch {
    return [];
  }
}

// Quote-aware CSV line splitter
function splitCsvLine(line) {
  const result = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !quoted) {
      quoted = true;
    } else if (char === '"' && quoted) {
      quoted = false;
    } else if (char === ',' && !quoted) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function run(cmd) {
  console.log(`Executing: ${cmd}`);
  try {
    const { stdout, stderr } = await execPromise(cmd, { timeout: 300000 });
    console.log(`Stdout preview (first 500 chars):\n${stdout.slice(0, 500)}...`);
    return { success: true, stdout, stderr };
  } catch (e) {
    console.log(`Error executing command: ${e.message}`);
    console.log(`Stderr:\n${e.stderr || e.message}`);
    return { success: false, stdout: e.stdout || '', stderr: e.stderr || e.message };
  }
}

async function runAll() {
  console.log('=== xnt-validator-analytics Test Runner ===\n');

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    console.log(`\nRunning: ${t.name}`);
    console.log('─'.repeat(50));

    const result = await run(t.cmd);

    if (!result.success) {
      console.log('❌ Command execution failed');
      failed++;
      continue;
    }

    let allGood = true;
    for (let i = 0; i < t.checks.length; i++) {
      const check = t.checks[i];
      const ok = await check.fn(result);
      if (!ok) {
        console.log(`✗ Check #${i+1} failed: ${check.desc}`);
        console.log('Full stdout for debug:\n' + result.stdout);
        allGood = false;
      }
    }

    if (t.cleanup) await t.cleanup().catch(() => {});

    if (allGood) {
      console.log('✓ All checks passed');
      passed++;
    } else {
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`Tests complete: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch(err => {
  console.error('Runner crashed:', err);
  process.exit(1);
});
