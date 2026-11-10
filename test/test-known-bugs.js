/**
 * Known bugs in fetch-total-validator-earnings.js, as tests run against a
 * stand-in X1 endpoint, so they ask nothing outside the computer.
 *
 * Each known-bug test states what the script should do and is declared with
 * `knownBug` (helpers/known-bug.js): it passes while the script still does
 * the wrong thing, and fails once the script does the right thing. That
 * failure is the cue to declare the test with `it` instead, in the same
 * change as the fix. The item number is that of the list of known bugs in
 * the repo's CLAUDE.md.
 *
 * The suite runs the real script once, in a child process, over three
 * epochs of the stand-in chain (helpers/stand-in-x1.js), each paying
 * 1.234567891 XNT. The script's working folder is a temp folder, removed
 * afterwards, so nothing is written into the repo.
 */

const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { parse } = require('csv-parse/sync');
const { startStandInX1 } = require('./helpers/stand-in-x1');
const { knownBug } = require('./helpers/known-bug');

const execFileAsync = promisify(execFile);

const SCRIPT = path.resolve(__dirname, '../fetch-total-validator-earnings.js');
const VOTE_PUBKEY = 'Ce5RppixDArjtH588uXMCryNYcAtbNqaWncY4tBCdYUs';
const REWARD_LAMPORTS = 1234567891;

describe('Known bugs, against a stand-in X1 endpoint', function () {
  this.timeout(60000);

  let x1;
  let dir;
  let rows;

  before(async function () {
    x1 = await startStandInX1({ votePubkey: VOTE_PUBKEY, rewardLamports: REWARD_LAMPORTS });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x1-validator-analytics-test-'));
    const output = path.join(dir, 'rewards.csv');
    await execFileAsync(
      process.execPath,
      [SCRIPT, '--rpc-url', x1.url, '--vote-pubkey', VOTE_PUBKEY, '--epochs', '3', '--output', output],
      { cwd: dir }
    );
    rows = parse(fs.readFileSync(output, 'utf8'), { bom: true, columns: true, skip_empty_lines: true, trim: true });
  });

  after(async function () {
    if (x1 !== undefined) await x1.close();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes one row per epoch asked for', function () {
    expect(rows).to.have.length(3);
  });

  describe('item 6: each reward is valued at the XNT price of its day, at its full amount', function () {
    knownBug('no row is valued at the $1.00 fallback price', function () {
      expect(rows.filter((row) => row['XNT Price (USD)'] === '1.000000')).to.have.length(0);
    });

    knownBug('each amount keeps all nine decimals', function () {
      expect(rows.map((row) => row['XNT Amount'])).to.deep.equal(['1.234567891', '1.234567891', '1.234567891']);
    });
  });
});
