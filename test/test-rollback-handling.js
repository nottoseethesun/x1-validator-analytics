const { expect } = require('chai');
const { runScript } = require('./test-utils');

describe('Rollback handling and failure counting', function () {
  this.timeout(300000);

  let result;

  before(async function () {
    result = await runScript(['--verbose']);
  });

  it('should detect exactly 15 early rollback-related failures', async () => {
    expect(result.stdout).to.match(/Note: 15 failures? in early epochs \(<=15\) are expected/);
  });

  it('should report 0 unexpected failures', async () => {
    expect(result.stdout).to.include('Unexpected failed epoch queries: 0');
  });

  it('should not flag any failures outside early range', async () => {
    expect(result.stdout).not.to.match(/unexpectedFailures: [^0]/);
  });
});
