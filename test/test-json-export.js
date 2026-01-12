const { expect } = require('chai');
const fs = require('fs').promises;
const { runScript, fileExists } = require('./test-utils');

const MAIN_JSON = 'xnt_rewards.json';
const ANALYTICS_JSON = 'xnt_rewards_analytics.json';

describe('JSON export test (--json flag)', function () {
  this.timeout(45000);

  let result;

  before(async function () {
    try { await fs.unlink(MAIN_JSON); } catch {}
    try { await fs.unlink(ANALYTICS_JSON); } catch {}

    result = await runScript(['--epochs', '4', '--json']);
  });

  it('completes successfully (exit code 0)', function () {
    expect(result.code).to.equal(0);
  });

  it('creates detailed rewards JSON', async function () {
    expect(await fileExists(MAIN_JSON)).to.be.true;
  });

  it('creates analytics summary JSON', async function () {
    expect(await fileExists(ANALYTICS_JSON)).to.be.true;
  });

  it('detailed JSON has exactly 4 reward entries', async function () {
    const content = await fs.readFile(MAIN_JSON, 'utf-8');
    const data = JSON.parse(content);
    const rewards = Array.isArray(data) ? data : (data.rewards || []);
    expect(rewards.length).to.equal(4);
  });

  it('analytics JSON contains correct summary metrics', async function () {
    const content = await fs.readFile(ANALYTICS_JSON, 'utf-8');
    const rows = JSON.parse(content);

    expect(Array.isArray(rows), 'Analytics JSON should be an array of metric rows').to.be.true;

    const findValue = (name) => {
      const row = rows.find(r => r.Metric && r.Metric.includes(name));
      return row ? row.Value : null;
    };

    const days = parseInt(findValue('Days Covered') || '0', 10);
    expect(days).to.equal(4, 'Days Covered should be 4');

    const totalXnt = parseFloat(findValue('Total XNT Earned') || '0');
    expect(totalXnt).to.be.greaterThan(10, 'Total XNT Earned should be positive');

    const unexpectedFailed = parseInt(findValue('Unexpected Failed') || '0', 10);
    expect(unexpectedFailed).to.equal(0, 'Unexpected Failed Epoch Queries should be 0');
  });

  after(async function () {
    try { await fs.unlink(MAIN_JSON); } catch {}
    try { await fs.unlink(ANALYTICS_JSON); } catch {}
  });
});
