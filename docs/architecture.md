# x1-validator-analytics — System Architecture

x1-validator-analytics reads what an X1 validator has earned: every
inflation reward its vote account received, each priced in USD at its own
time, written to a CSV with running totals, an analytics summary, and,
when asked, JSON. It is one script that runs on Node, the program that runs
JavaScript outside a browser.

Two companion references sit alongside this one:

- [`docs/engineering.md`](engineering.md): the files on disk, the gates,
  the tests and CI, the checks GitHub, the website that hosts the repo,
  runs at each push.
- [`docs/npm-project-commands.md`](npm-project-commands.md): every command
  the repo's `package.json` gives npm, Node's package manager, to run, and
  its flags.

---

## Table of Contents

- [The Modules](#the-modules)
- [A Run](#a-run)
- [Prices](#prices)
- [Amounts](#amounts)
- [Api Keys](#api-keys)
- [crypto-price-fetchers](#crypto-price-fetchers)
- [Technology Choices](#technology-choices)

---

## The Modules

A run goes through these modules, from the settings to the reports. Prices
come from GeckoTerminal, a service that lists the pools of decentralized
exchanges with their prices and candles, through the client of
crypto-price-fetchers, the owner's repo of code his projects share, which
this repo installs ([crypto-price-fetchers](#crypto-price-fetchers)).

| Module | What it does |
| ------ | ------------ |
| `fetch-total-validator-earnings.js` | The command line, declared with commander, the package that parses a command line and writes its help: reads the settings, asks the chain for each epoch's reward, prices them, and writes the reports. `--help` lists its options, with examples and its exit codes. |
| `configLoader.js` | The settings: `config.json`, over the defaults. |
| `xnt-price.js` | XNT's USD price at a time, from GeckoTerminal, through crypto-price-fetchers' GeckoTerminal client. |
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

A reward's price is XNT's price in USDC.X at its time: the close of the last
hourly candle that opened at or before it, less than a day before it, from
GeckoTerminal's candles for the configured pool, WXNT / USDC.X on XDEX, a
decentralized exchange on X1. The candles are asked in the pool's own rate
(`currency=token`), since GeckoTerminal's USD candles for XNT show one fixed
price at every hour. GeckoTerminal's X1 candles start on 2026-10-01, and its
public api serves the last 180 days: a reward before either gets an empty
price cell and a warning, never a stand-in price.

crypto-price-fetchers' GeckoTerminal client
(`crypto-price-fetchers/dex-prices/geckoterminal`) asks for the candles, a
thousand hours a request, within its budget of requests, sends a request
refused as too many again after its waits, and finds each reward's candle.
`xnt-price.js` asks it for the pool's candles from a day before the
earliest reward to the latest, and checks that the pool pairs XNT with
the stablecoin.

---

## Amounts

XNT has nine decimal places. A float holds about 16 significant digits,
fewer than a large amount with nine decimal places needs. So an amount is
kept as a whole number of lamports, a BigInt, and written with all nine
places, never through a float, and no amount or total loses a digit.
@solana/web3.js, the library the script asks the X1 endpoint through, gives
every number the chain answers with as a BigInt: the amounts stay BigInts,
and the epoch numbers and block times, which are small, are counted as
numbers. A price is written to six decimal places, and a value is the amount
times that written price, to four, so each row multiplies out as shown.

---

## Api Keys

The script sends no api key: GeckoTerminal and the X1 endpoint take none.
The repo is ready for one all the same, through crypto-price-fetchers' key
store, set up as in pulsechain-analytics and pulsechain-validator-analytics,
the owner's other projects that install it: the top `config.json` lists the
services whose keys the programs send, under `apiKeys`, empty today; this
repo's `npm run api-keys` runs the store's key manager, and
`unlock-api-keys.sh`, a script in the repo's top folder and a copy of
crypto-price-fetchers', keeps the password for a terminal. A key would be
kept in `api-keys.json`, which git, the version-control program that
keeps the repo's history, ignores, encrypted with the owner's password.

---

## crypto-price-fetchers

This repo installs
[crypto-price-fetchers](https://github.com/nottoseethesun/crypto-price-fetchers)
from GitHub, as a dependency `npm install` installs, for the GeckoTerminal
client, the key store, the security lint's rule against printing a
secret, and `run-actionlint`, which runs actionlint, the checker of GitHub
Actions workflow files, from its official release, refused unless its
SHA-256 is the one crypto-price-fetchers pins. `package.json` names its main branch (`#main`), and
`package-lock.json` keeps the commit installed, which `npm ci` installs.
crypto-price-fetchers' versions tool, which this repo runs as
`npm run github-project-deps`, moves it: `-- main` to main's newest commit,
and `-- release` to its latest release (`#semver:*`), its highest version
tag. The tool sets the ref, then makes the lockfile again from a fresh
`node_modules`, and puts both files back if the install fails.

---

## Technology Choices

- **Node 24 or later**, ES modules, and Node's own test runner.
- **@solana/web3.js 3** for the X1 endpoint, which speaks Solana's
  json-rpc.
- **commander** for the command line, as the rules of LP Ranger, the
  owner's bot that manages his 9mm V3 liquidity positions, ask: the help
  it writes lists the options from the declaration the script parses.
- **csv-stringify**, a package that turns rows into CSV text, for the CSV
  files.
