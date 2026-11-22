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
- [`docs/project-commands.md`](project-commands.md): every command,
  those the repo's `package.json` gives npm, Node's package manager, to run
  and those run with `node` or `source`, with its flags.

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
| `configLoader.js` | The settings: `config.json`, checked against its JSON Schema, over the defaults. |
| `public-key.js` | A public key, as X1 writes an address: 32 bytes in base58, the kind of value the options and settings that hold one share. |
| `xnt-price.js` | XNT's USD price at a time, from GeckoTerminal, through crypto-price-fetchers' GeckoTerminal client. |
| `xnt-amount.js` | Amounts of XNT, exact to the lamport. |
| `rewards.js` | The report's rows, with their running totals. |
| `summary.js` | The run's summary, for the console, the analytics CSV and the analytics JSON. |
| `csvWriter.js`, `jsonWriter.js` | The reports. |

---

## A Run

1. The settings come from `config.json` and the command line: the X1
   endpoint, how long a request to it may take to answer in full before it
   counts as failed (`requestTimeoutSeconds`, 30 unless set, a whole
   number of seconds up to 2147483, the longest time limit Node's timers
   keep, through crypto-price-fetchers' `fetchWithinTimeLimit`), the vote
   account, the pool prices come from, the output file, and how many epochs
   to read. `config.json` is checked against its JSON Schema before the
   script takes a setting, and each option's parser is made from the kind
   of value the schema gives the same setting, so a mistake in either stops
   the run, naming the setting or the option, before the chain is asked.
2. The script finds the vote account and the current epoch, then asks the
   endpoint for the account's inflation reward in each epoch, from the last
   completed one back to epoch 0, or as many as asked. A reward's time is
   the block time of its slot. A failed request for it is asked again
   twice, 2 seconds apart; when the chain still gives none, or the reward
   names no slot, the run stops with exit code 1, naming the epoch, so no
   row carries an estimated date or price. The endpoint answers an epoch with the
   account's reward, or with none, as it does for an epoch before the
   account began or one it missed; or the query fails, and the epoch is
   skipped. Each outcome is counted. X1's chain was rolled back early in
   its life, and the endpoint cannot give the rewards of some epochs from
   0 to 15, epoch 15 among them, so a failed query there is counted as
   expected. The share of expected epochs with a reward counts the epochs
   from the account's first reward on, less those whose query failed. The
   json export names that first reward's epoch.
3. It prices each reward at its own time (see [Prices](#prices)).
4. It writes one row per reward, oldest first, with the running totals of
   XNT and USD, to the file `--output` or `config.json` names; the
   analytics summary to `xnt_rewards_analytics.csv`, in the folder it runs
   in; and, with `--json`, both as JSON, to `xnt_rewards.json` and
   `xnt_rewards_analytics.json`, in that folder too.

---

## Prices

A reward's price is XNT's price in USDC.X at its time: the close of the last
hourly candle that opened at or before it, less than a day before it, from
GeckoTerminal's candles for the configured pool, WXNT / USDC.X on XDEX, a
decentralized exchange on X1. The candles are asked in the pool's own rate
(`currency=token`), since GeckoTerminal's USD candles for XNT show one fixed
price at every hour. GeckoTerminal's X1 candles start on 2026-10-01, and its
public api serves candles back to about 220 days ago: it answers a request
only when its before-time is within the last 180 days, and the client's
last page, asked a day inside that edge, reaches a thousand hourly candles
further back, more where hours went without a trade. A reward before
either gets an empty price cell and a warning, never a stand-in price.

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
client, the key store, the lint rules against printing a secret and
against a default made with `||` (`no-or-default`), `run-actionlint`,
which runs actionlint, the checker of GitHub Actions workflow files, from
its official release, refused unless its SHA-256 and its program's are the
ones crypto-price-fetchers pins, the checks of a settings file against its
JSON Schema and the option parsers made from the same kinds of value, the
helper that ends a command line quietly when its output closes, the time
limit on each request to the X1 endpoint, and the checks its tests make
of each command line's help and of the repo's tracked files. `package.json` names its main branch (`#main`), and
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
