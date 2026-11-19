# X1 Blockchain Validator Analytics

![An android, inspired by Isaac Asimov's "Easy" robot, in a formal black tuxedo with a bow tie and metallic hands stands with glowing blue eyes, projecting a scanning beam into a continuous stream of luminous blue holographic code, text, and floating data panels in a dark high-tech interior lit by blue neon.](./assets/images/easy-the-android-analyzes-the-validator-data_1280-640.jpeg "X1 Blockchain Validator Analytics")

[![Lint (JS+MD)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/x1-validator-analytics/ci.yml?branch=main&label=lint)](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/ci.yml)
[![Tests (Node 22/24)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/x1-validator-analytics/ci.yml?branch=main&label=tests)](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/nottoseethesun/x1-validator-analytics/security-audit.yml?branch=main&label=security)](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/security-audit.yml)

## Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

A script that reads what an X1 validator has earned: every inflation
reward its vote account received, each priced in USD at its own time,
written to a CSV file with running totals, and a summary beside it.

### Current Roster of Utilities

- fetch-total-validator-earnings.js

#### Sample Output

The two CSV files a run writes, opened in Google Sheets: the rewards, each
with its price and the running totals, and the summary.

![Validator Rewards with Prices](./readme-images/xnt-rewards-with-prices.png)
![Validator Rewards Analytics](./readme-images/xnt-rewards-analytics.png)

## Prerequisites

NodeJS 22 or later.

## Installation

```bash
npm install
```

It installs everything the script needs, crypto-price-fetchers' key store
among it, from GitHub.

### Api keys

The script sends no api key today: GeckoTerminal and the X1 endpoint take
none. Should a service that takes one be added, its key is kept in
`api-keys.json` here, which git ignores, encrypted with a password you
choose, as LP Ranger keeps its keys. The top `config.json` lists the
services under `apiKeys`; `npm run api-keys` lists their keys, never
showing their characters, and saves each one asked for; and
`source ./unlock-api-keys.sh` keeps the password for a terminal. A key is
never a setting in a file, nor a command-line argument.

## Usage

The file header of `fetch-total-validator-earnings.js` says how to run the
script, and `--help` lists its options.

Each reward is priced in USD at its own time, from GeckoTerminal's hourly
candles for the configured XDEX pool, WXNT / USDC.X. GeckoTerminal's X1
candles start on 2026-10-01, so an earlier reward has empty price and value
cells, with a warning. Amounts keep all nine of XNT's decimal places.

## Development

### Test

The tests ask nothing outside your computer. The one gate that must pass
before a commit, LP Ranger's, runs the lint, the tests and the security
audits:

```bash
npm ci
npm run check
```

[`test/README.md`](./test/README.md) describes the tests.

### Documentation

The `docs/` folder holds three references:

- [`docs/architecture.md`](docs/architecture.md): how the script works.
- [`docs/engineering.md`](docs/engineering.md): the files, the gates, the
  tests and CI.
- [`docs/npm-project-commands.md`](docs/npm-project-commands.md): every npm
  command.

## Contributing

Fork me on GitHub. :)  Contributions are welcome but note that any contributions are subject to the license as defined in the LICENSE file here.

To be accepted for pull request:

- All tests must pass
- Any major new functionality must have a test runnable from the current approach
- All code must be modular e.g. low cyclomatic complexity ~17 or so.
