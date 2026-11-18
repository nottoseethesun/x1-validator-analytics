# Tests for x1-validator-analytics

The tests run on Node's own test runner, from the repo's top folder. They ask
nothing outside the computer: the script runs against a stand-in X1 endpoint
and a stand-in GeckoTerminal, both served on this computer, in a temp folder
of its own that is removed afterwards, so nothing is written into the repo.

## Run

Node 22 or later.

```bash
npm ci
npm test
```

`npm run check` runs them with coverage, failing below 80% of lines
covered, after the lint and before the security audits.

One file:

```bash
node --test test/xnt-price.test.js
```

## Files

| File | What it checks |
| --- | --- |
| `fetch-total-validator-earnings.test.js` | The real script, run in a child process: one row per reward, oldest first, amounts and the XNT running total exact to nine decimal places, each price the close of its own hour's candle in the pool's own rate, values and the USD running total, a reward before GeckoTerminal's first candle left unpriced with a warning and never valued at $1.00, the failures of epochs 0 to 15 counted as expected, the json export, and a run with no prices when GeckoTerminal refuses |
| `xnt-price.test.js` | Picking a time's candle, asking GeckoTerminal for the candles a thousand hours at a time, its refusals and the waits after a 429, and the check of the pool's pair |
| `xnt-amount.test.js` | Writing lamports as XNT with all nine decimal places |
| `rewards.test.js` | The report's rows, the summary and the analytics metrics |
| `api-keys.test.js` | The keys `config.json` lists, none today, the key manager, the copy of crypto-price-fetchers' `unlock-api-keys.sh`, and the pin of crypto-price-fetchers |

## Helpers

- `helpers/stand-in-x1.js` serves a stand-in X1 json-rpc endpoint: a chain
  at a time and epoch the test names, paying the same reward every epoch,
  with early epochs that fail, as X1's do after its rollback, when the test
  says so. `rewardSeconds` gives an epoch's reward time.
- `helpers/stand-in-gecko-terminal.js` answers for a pool's hourly candles
  as GeckoTerminal does, as a fetch or served on a local port. Asked in USD,
  it gives one fixed price at every hour, as GeckoTerminal does for X1.
- `helpers/run-script.js` runs the script against both stand-ins and reads
  the files it wrote.
- `helpers/known-bug.js` declares a test of a known bug (see `../CLAUDE.md`).
