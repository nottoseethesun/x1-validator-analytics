# x1-validator-analytics — System Architecture

x1-validator-analytics reads what an X1 validator has earned: every
inflation reward its vote account received, each priced in USD at its own
time, written to a CSV with running totals, an analytics summary, and,
when asked, JSON.

Two companion references sit alongside this one:

- [`docs/engineering.md`](engineering.md): the files on disk, the gates,
  the tests and CI.
- [`docs/npm-project-commands.md`](npm-project-commands.md): every npm
  command and its flags.

---

## Table of Contents

- [The Modules](#the-modules)
- [A Run](#a-run)
- [Prices](#prices)
- [Amounts](#amounts)
- [Api Keys](#api-keys)
- [Technology Choices](#technology-choices)

---

## The Modules

A run goes through these modules, from the settings to the reports.

| Module | What it does |
| ------ | ------------ |
| `fetch-total-validator-earnings.js` | The command line: reads the settings, asks the chain for each epoch's reward, prices them, and writes the reports. |
| `configLoader.js` | The settings: `config.json`, over the defaults. |
| `xnt-price.js` | XNT's USD price at a time, from GeckoTerminal. |
| `xnt-amount.js` | Amounts of XNT, exact to the lamport. |
| `rewards.js` | The report's rows, with their running totals. |
| `summary.js` | The run's summary, for the console, the analytics CSV and the analytics JSON. |
| `csvWriter.js`, `jsonWriter.js` | The reports. |

---

## A Run

1. The settings come from `config.json` and the command line: the X1
   endpoint, the vote account, the pool prices come from, the output file,
   and how many epochs to read.
2. The script finds the vote account and the current epoch, then asks the
   endpoint for the account's inflation reward in each epoch, from the last
   completed one back to epoch 0, or as many as asked. A reward's time is
   the block time of its slot. An epoch the endpoint cannot answer is
   skipped and counted. X1's chain was rolled back early in its life, so
   its endpoint cannot answer for epochs 0 to 15: those fail as expected.
3. It prices each reward at its own time (see [Prices](#prices)).
4. It writes one row per reward, oldest first, with the running totals of
   XNT and USD, the analytics summary beside it, and, with `--json`, both as
   JSON.

---

## Prices

A reward's price is XNT's price in USDC.X at its time: the close of the
last hourly candle that opened at or before it, less than a day before it,
from GeckoTerminal's candles for the configured pool, XDEX's WXNT /
USDC.X. The candles are asked in the pool's own rate (`currency=token`),
since GeckoTerminal's USD candles for XNT show one fixed price at every
hour. GeckoTerminal's X1 candles start on 2026-10-01: an earlier reward
gets an empty price cell and a warning, never a stand-in price.
`xnt-price.js` explains how the candles are asked, a thousand hours at a
time, and what it does after a refusal or a rate limit.

---

## Amounts

XNT has nine decimal places. A float holds about 16 significant digits,
fewer than a large amount with nine decimal places needs. So an amount is
kept as a whole number of lamports, a BigInt, and written with all nine
places, never through a float, and no amount or total loses a digit. @solana/web3.js gives every
number the chain answers with as a BigInt: the amounts stay BigInts, and
the epoch numbers and block times, which are small, are counted as
numbers. A price is written to six
decimal places, and a value is the amount times that written price, to
four, so each row multiplies out as shown.

---

## Api Keys

The script sends no api key: GeckoTerminal and the X1 endpoint take none.
The repo is ready for one all the same, as its sibling projects are: the
top `config.json` lists the services whose keys the programs send, under
`apiKeys`, empty today; `npm run api-keys` runs crypto-price-fetchers' key
manager, and `unlock-api-keys.sh`, a copy of crypto-price-fetchers', keeps
the password for a terminal. A key would be kept in `api-keys.json`, which
git ignores, encrypted with the owner's password.

This repo installs [crypto-price-fetchers](https://github.com/nottoseethesun/crypto-price-fetchers)
from GitHub, pinned to a commit, as a dependency `npm install` installs,
for the key store and for the security lint's rule against printing a
secret.

---

## Technology Choices

- **Node 22 or later**, ES modules, and Node's own test runner.
- **@solana/web3.js 3** for the X1 endpoint, which speaks Solana's
  json-rpc.
- **yargs** for the command line; **csv-stringify** for the CSV.
