# Tests for x1-validator-analytics

The tests run on the test runner built into Node, the program that runs
JavaScript outside a browser, from the repo's top folder. They ask nothing
outside the computer: the script runs against a stand-in X1 endpoint and a
stand-in GeckoTerminal, the service it takes prices from, which it asks
through the client of crypto-price-fetchers, the owner's repo of code his
projects share, on GitHub, the website that hosts it, both stand-ins served
on this computer, in a temp folder of its own that is removed afterwards, so
nothing is written into the repo.

## Run

Node 22 or later. npm, Node's package manager, installs the packages and
runs the tests:

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

One test file runs the whole script; the others test one module each.

| File | What it checks |
| --- | --- |
| `fetch-total-validator-earnings.test.js` | The real script, run in a child process: one row per reward, oldest first, amounts and the XNT running total exact to nine decimal places, each price the close of its own hour's candle in the pool's own rate, values and the USD running total, a reward before GeckoTerminal's first candle left unpriced, with a warning, the failures of epochs 0 to 15 counted as expected, the json export, a run with no prices when GeckoTerminal refuses, and a verbose run, which prints each epoch's raw answer and still finds every reward |
| `xnt-price.test.js` | The candles asked of crypto-price-fetchers' GeckoTerminal client, in the pool's own rate of XNT, from a day before the earliest time, a thousand hours at a time, its refusals and the waits after a 429, the check of the pool's pair, and each time's price from the close of its candle |
| `xnt-amount.test.js` | Writing lamports as XNT with all nine decimal places |
| `rewards.test.js` | The report's rows, the summary and the analytics metrics |
| `api-keys.test.js` | The keys `config.json` lists, none today, the key manager, which saves and lists the api keys, and the copy of crypto-price-fetchers' `unlock-api-keys.sh`, the script that keeps the password for a terminal |
| `command-line-help.test.js` | Every command line's help, `--help` and `-h`: the script's, the key manager's and crypto-price-fetchers' versions tool's, each with its options, examples and exit codes, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/command-line-help`); and that its list holds every command line the repo runs |
| `dependencies.test.js` | crypto-price-fetchers installed from GitHub, following its main branch or its latest release, and `npm run github-project-deps` running its versions tool |

## Helpers

- `helpers/stand-in-x1.js` serves a stand-in X1 json-rpc endpoint: a chain
  at a time and epoch the test names, paying the same reward every epoch.
  When the test says so, its early epochs fail, as X1's first sixteen do,
  since its chain was rolled back early in its life. `rewardSeconds` gives an epoch's reward time.
- `helpers/stand-in-gecko-terminal.js` answers for a pool's hourly candles
  as GeckoTerminal does, as a fetch or served on a local port. Asked in USD,
  it gives one fixed price at every hour, as GeckoTerminal does for X1.
- `helpers/run-script.js` runs the script against both stand-ins and reads
  the files it wrote.
- `helpers/known-bug.js` declares a test of a known bug (see `../CLAUDE.md`).
