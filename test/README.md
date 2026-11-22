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

Node 24 or later. npm, Node's package manager, installs the packages and
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
| `fetch-total-validator-earnings.test.js` | The real script, run in a child process: one row per reward, oldest first, amounts and the XNT running total exact to nine decimal places, each price the close of its own hour's candle in the pool's own rate, values and the USD running total, a reward before GeckoTerminal's first candle left unpriced, with a warning, the failures of epochs 0 to 15 counted as expected, the json export, a run with no prices when GeckoTerminal refuses, a wrong public key or url refused, naming its option, a verbose run, which prints each epoch's raw answer and the current epoch's first slot, and still finds every reward, an account that began at epoch 20, whose epochs with no reward are counted apart from its failed query, whose share of expected epochs with a reward counts from its first reward, and whose json export names that first reward's epoch, an endpoint that does not answer and one that stops in the middle of its answer, each given up on after `requestTimeoutSeconds`, a time limit that is no number of seconds refused, and `config.json` holding only settings a program reads |
| `xnt-price.test.js` | The candles asked of crypto-price-fetchers' GeckoTerminal client, in the pool's own rate of XNT, from a day before the earliest time, a thousand hours at a time, its refusals and the waits after a 429, the check of the pool's pair, and each time's price from the close of its candle |
| `xnt-amount.test.js` | Writing lamports as XNT with all nine decimal places |
| `rewards.test.js` | The report's rows, the epochs counted by outcome, the summary and the analytics metrics |
| `csv-writer.test.js` | The rewards CSV and the analytics CSV, each starting with a UTF-8 BOM and ending with one newline, after its last row |
| `api-keys.test.js` | The keys `config.json` lists, none today, the key manager, which saves and lists the api keys, and the copy of crypto-price-fetchers' `unlock-api-keys.sh`, the script that keeps the password for a terminal |
| `command-line-help.test.js` | Every command line's help, `--help` and `-h`, and its help into a pipe closed before it is written, which must end with exit code 0 and nothing on stderr: the script's, the key manager's, and those of the bins of crypto-price-fetchers the npm targets run, its versions tool and `run-actionlint`, each with its options, examples and exit codes, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/command-line-help`); and that its list holds every command line the repo runs, every bin of crypto-price-fetchers among them |
| `repo-checks.test.js` | The repo's tracked files, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/repo-checks`): every EVM address in EIP-55's form, every npm target named in `docs/npm-project-commands.md`, every test file and helper named here, in `docs/engineering.md` or in `CLAUDE.md`, and every link and path in a doc pointing at a file, folder or heading the repo keeps |
| `dependencies.test.js` | crypto-price-fetchers installed from GitHub, following its main branch or its latest release, and `npm run github-project-deps` running its versions tool |

## Helpers

- `helpers/stand-in-x1.js` serves a stand-in X1 json-rpc endpoint: a chain
  at a time and epoch the test names, paying the same reward every epoch,
  with the account's credits for the last five epochs, as `getVoteAccounts`
  gives them. When the test says so, it answers with no reward for some
  epochs, as X1's endpoint does for an epoch before an account began or one
  it missed; fails the query of others, as X1's does for epoch 15, after
  its chain was rolled back early in its life; or answers nothing at all.
  `rewardSeconds` gives an epoch's reward time.
- `helpers/stand-in-gecko-terminal.js` answers for a pool's hourly candles
  as GeckoTerminal does, as a fetch or served on a local port. Asked in USD,
  it gives one fixed price at every hour, as GeckoTerminal does for X1.
- `helpers/run-script.js` runs the script against both stand-ins and reads
  the files it wrote.
- `helpers/known-bug.js` declares a test of a known bug (see `../CLAUDE.md`).
