const { expect } = require('chai');
const { runScript, fileExists } = require('./test-utils');

describe('Full history rewards test (no --epochs)', function () {
  this.timeout(300000); // 5 minutes

  let result;

  before(async function () {
    result = await runScript([]);
  });

  it('should complete without error', async () => {
    expect(result.success).to.be.true;
  });

  it('should find approximately 99 rewards', async () => {
    expect(result.stdout).to.match(/Main CSV written to: xnt_rewards_with_prices\.csv \(99 reward entries\)/);
  });

  it('should report exactly 15 early failures', async () => {
    expect(result.stdout).to.include('Failed epoch queries (due to early X1 chain roll-back');
    expect(result.stdout).to.match(/Failed epoch queries.*15/);
  });

  it('should show rollback note', async () => {
    expect(result.stdout).to.include('Note: 15 failures in early epochs (<=15) are expected due to the X1 Mainnet Buenos Aires Reboot/rollback');
  });
});
