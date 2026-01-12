const { expect } = require('chai');
const { runScript, fileExists, readCsv, MAIN_CSV_FILENAME } = require('./test-utils');

const ANALYTICS_CSV = 'xnt_rewards_analytics.csv';

describe('Rollback handling test (--epochs 50)', function () {
  this.timeout(90000);

  let result;

  before(async function () {
    try { await fs.unlink(MAIN_CSV_FILENAME); } catch {}
    try { await fs.unlink(ANALYTICS_CSV); } catch {}

    result = await runScript(['--epochs', '50']);
  });

  it('completes successfully (exit code 0)', function () {
    expect(result.code, 'Script should exit with code 0').to.equal(0);
  });

  it('creates both output CSVs', async function () {
    if (result.code !== 0) this.skip('Script failed - no output files generated');
    expect(await fileExists(MAIN_CSV_FILENAME)).to.be.true;
    expect(await fileExists(ANALYTICS_CSV)).to.be.true;
  });

  it('shows no rollback failures in this limited epoch range', async function () {
    if (result.code !== 0) this.skip('Script failed - no output files generated');
    
    const records = readCsv(MAIN_CSV_FILENAME);

    const earlyFailures = records.filter(r => 
      (r.failed === 'true' || r.error) && Number(r.epoch || r.Epoch || 0) <= 15
    );

    const unexpectedFailures = records.filter(r => 
      (r.failed === 'true' || r.error) && Number(r.epoch || r.Epoch || 0) > 15
    );

    expect(unexpectedFailures.length).to.equal(0,
      'Should have zero unexpected failures in queried range');

    expect(earlyFailures.length).to.equal(0,
      'No early rollback failures in this limited epoch range (pre-reboot epochs not reached)');
  });

  after(async function () {
    try { await fs.unlink(MAIN_CSV_FILENAME); } catch {}
    try { await fs.unlink(ANALYTICS_CSV); } catch {}
  });
});
