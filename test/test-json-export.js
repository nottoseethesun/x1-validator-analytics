const { expect } = require('chai');
const { runScript, fileExists, readJson } = require('./test-utils');

describe('JSON export (--json flag)', function () {
  this.timeout(60000);

  let result;

  before(async function () {
    result = await runScript(['--epochs', '4', '--json']);
  });

  after(async function () {
    try { await fs.unlink('xnt_rewards.json'); } catch {}
    try { await fs.unlink('xnt_rewards_analytics.json'); } catch {}
  });

  it('should create xnt_rewards.json', async () => {
    expect(await fileExists('xnt_rewards.json')).to.be.true;
  });

  it('should create xnt_rewards_analytics.json', async () => {
    expect(await fileExists('xnt_rewards_analytics.json')).to.be.true;
  });

  it('full JSON should contain rewards array with 4 entries', async () => {
    const json = await readJson('xnt_rewards.json');
    expect(json.rewards).to.be.an('array').with.lengthOf(4);
  });

  it('analytics JSON should contain at least 10 metrics', async () => {
    const json = await readJson('xnt_rewards_analytics.json');
    expect(json).to.be.an('array').with.lengthOf.at.least(10);
  });

  it('analytics JSON should include expected percentage metric', async () => {
    const json = await readJson('xnt_rewards_analytics.json');
    const hasExpectedPct = json.some(item => 
      item.Metric.includes('Percentage of Expected Epochs with Rewards')
    );
    expect(hasExpectedPct).to.be.true;
  });
});
