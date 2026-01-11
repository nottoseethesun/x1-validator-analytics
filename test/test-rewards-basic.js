const { expect } = require('chai');
const { runScript, fileExists, readCsv } = require('./test-utils');

describe('Basic rewards test (--epochs 4)', function () {
  this.timeout(30000);

  let result;

  before(async function () {
    result = await runScript(['--epochs', '4']);
  });

  it('should complete without error', async () => {
    expect(result.success).to.be.true;
  });

  it('should find exactly 4 rewards', async () => {
    expect(result.stdout).to.include('Main CSV written to: xnt_rewards_with_prices.csv (4 reward entries)');
  });

  it('should create main CSV', async () => {
    expect(await fileExists('xnt_rewards_with_prices.csv')).to.be.true;
  });

  it('should create analytics CSV', async () => {
    expect(await fileExists('xnt_rewards_analytics.csv')).to.be.true;
  });

  it('should have correct days covered (4)', async () => {
    const csv = await readCsv('xnt_rewards_analytics.csv');
    const daysRow = csv.find(row => row[0] === 'Days Covered');
    expect(daysRow[1]).to.equal('4');
  });

  it('should have 0 failed queries', async () => {
    const csv = await readCsv('xnt_rewards_analytics.csv');
    const failedRow = csv.find(row => row[0].includes('Failed Epoch Queries'));
    expect(parseInt(failedRow[1])).to.equal(0);
  });
});
