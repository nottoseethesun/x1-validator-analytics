const { expect } = require('chai');
const fs = require('fs').promises;
const { runScript, fileExists, readCsv, MAIN_CSV_FILENAME } = require('./test-utils');

const ANALYTICS_CSV = 'xnt_rewards_analytics.csv';

describe('Basic rewards test (--epochs 4)', function () {
  let result;

  before(async function () {
    try { await fs.unlink(MAIN_CSV_FILENAME); } catch {}
    try { await fs.unlink(ANALYTICS_CSV); } catch {}

    result = await runScript(['--epochs', '4']);
  });

  it('completes successfully (exit code 0)', function () {
    expect(result.code, 'Script should exit with code 0').to.equal(0);
  });

  it('creates the main rewards CSV', async function () {
    if (result.code !== 0) this.skip('Script failed - no output files generated');
    expect(await fileExists(MAIN_CSV_FILENAME)).to.be.true;
  });

  it('creates the analytics summary CSV', async function () {
    if (result.code !== 0) this.skip('Script failed - no output files generated');
    expect(await fileExists(ANALYTICS_CSV)).to.be.true;
  });

  it('finds exactly 4 reward entries', async function () {
    if (result.code !== 0) this.skip('Script failed - no output files generated');
    const records = readCsv(MAIN_CSV_FILENAME);
    expect(records.length).to.equal(4, `Expected 4 rewards, found ${records.length}`);
  });

  it('covers exactly 4 days', async function () {
    if (result.code !== 0) this.skip('Script failed - no output files generated');
    const records = readCsv(MAIN_CSV_FILENAME);
    expect(records.length).to.equal(4, 'Should cover 4 days/epochs');
  });

  it('has zero failed epoch queries', async function () {
    if (result.code !== 0) this.skip('Script failed - no output files generated');
    const records = readCsv(MAIN_CSV_FILENAME);
    const failed = records.filter(r => 
      r.failed === 'true' || r.error || (r.status && r.status.toLowerCase().includes('fail'))
    );
    expect(failed.length).to.equal(0, `Found ${failed.length} failed entries`);
  });

  after(async function () {
    try { await fs.unlink(MAIN_CSV_FILENAME); } catch {}
    try { await fs.unlink(ANALYTICS_CSV); } catch {}
  });
});
