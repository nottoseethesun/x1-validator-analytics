# Test Suite for x1-validator-analytics

This directory contains automated Mocha tests to catch regressions in `../fetch-total-validator-earnings.js`.

All tests use the fixed vote pubkey:  
`Ce5RppixDArjtH588uXMCryNYcAtbNqaWncY4tBCdYUs`

## Requirements

- Node.js >= 20
- The main script and its modules (`../configLoader.js`, `../csvWriter.js`, `../jsonWriter.js`) in the parent directory
- `../config.json` present (or defaults will be used)

## Installation (once)

```bash
cd test
npm install
```

Note: A `package.json` already exists with the required dev dependencies, so this will install them. No need to run `npm init`.

## Available Tests

All tests use the fixed vote pubkey shown above.

| File                        | What it checks                                                                                     | Typical run time | Command                     |
|-----------------------------|----------------------------------------------------------------------------------------------------|------------------|-----------------------------|
| test-rewards-basic.js       | Small `--epochs 4` run: exit code 0, creates CSVs, exactly 4 rewards/days, zero failures           | ~5–10 sec        | `npm run test:basic`        |
| test-rewards-full.js        | Full history (no `--epochs`): exit code 0, creates CSVs, exactly 99 rewards, exactly 15 early rollback failures, zero unexpected failures | ~30–60 sec       | `npm run test:full`         |
| test-rollback-handling.js   | `--epochs 50` run: exit code 0, creates CSVs, zero early failures (pre-reboot epochs not reached), zero unexpected failures | ~10–20 sec       | `npm run test:rollback`     |
| test-json-export.js         | `--json` flag with `--epochs 4`: exit code 0, creates both JSON files, detailed JSON has exactly 4 entries, analytics JSON has correct summary metrics (days=4, total positive, failures=0) | ~10–20 sec       | `npm run test:json`         |

## How to Run

Run the full suite (recommended – all 20 tests; automatically cleans up old output files first):

```bash
npm test
```

Run a single test group (also auto-cleans first):

```bash
npm run test:basic
npm run test:full
npm run test:rollback
npm run test:json
```

Filter tests by name (runs matching files):

```bash
npm test -- --grep "basic"
npm test -- --grep "json"
npm test -- --grep "rollback"
npm test -- --grep "full"
```

### Cleaning Output Files

Test runs automatically clean old output files (CSVs/JSONs) before execution (via `pretest` hook and explicit calls in individual scripts).

To clean manually (e.g. after manual script runs or failed tests):

```bash
npm run clean
```

Files removed:

- `xnt_rewards_with_prices.csv`
- `xnt_rewards_analytics.csv`
- `xnt_rewards.json`
- `xnt_rewards_analytics.json`
- `test-output.csv`

## Tips

- Full-history test (`npm run test:full`) takes longest — run it periodically to catch chain/RPC changes.
- Increase timeout if RPC is slow: edit `package.json` or run `npm test -- --timeout 600000`
- All tests are locked to the fixed vote pubkey above — update `test-utils.js` if testing other validators.

## Exit Codes & Expectations

- All tests pass → exit code 0
- Any failure → exit code 1 + detailed error message
