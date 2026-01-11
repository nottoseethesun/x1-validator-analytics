# Test Suite for xnt-validator-analytics

This directory contains automated tests to catch common regressions in fetch-total-validator-earnings.js.

All tests use the fixed vote pubkey:
Ce5RppixDArjtH588uXMCryNYcAtbNqaWncY4tBCdYUs

## Requirements

- Node.js >= 20
- The main script and its modules (configLoader.js, csvWriter.js, jsonWriter.js) in the parent directory
- config.json present (or defaults will be used)

## Installation (once)

cd test
npm init -y
npm install mocha chai chai-as-promised sinon --save-dev

## Available Tests

File                           What it checks                                                                 Typical run time
test-rewards-basic.js          Small --epochs 4 run: count, totals, cumulatives, dates, no failures         ~5–10 sec
test-rewards-full.js           Full history (no --epochs): expects ~99 rewards, 15 early failures, correct rollback note ~1–2 min
test-rollback-handling.js      Verifies rollback note appears only for early failures, unexpected = 0        ~10–20 sec
test-json-export.js            --json flag: checks both JSON files exist, contain correct metrics & cumulatives ~10–20 sec

## How to Run (after npm install in test/ directory)

Run all tests:

```bash
mocha *.js --timeout 300000 --reporter spec
```

Run a single test:

```bash
mocha test-rewards-basic.js
```

Run with verbose output:

```bash
mocha --reporter spec *.js
```

## Exit Codes & Expectations:

- All tests pass → exit code 0
- Any failure → exit code 1 + detailed error

## Tips

- Run full-history test periodically to catch RPC changes
- Increase --timeout if your RPC is slow
- Add --grep "basic" to run only specific tests (e.g. mocha *.js --grep "basic")

Happy testing!
