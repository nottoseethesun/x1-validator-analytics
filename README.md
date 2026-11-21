# X1 Blockchain Validator Analytics

![An android, inspired by Isaac Asimov's "Easy" robot, in a formal black tuxedo with a bow tie and metallic hands stands with glowing blue eyes, projecting a scanning beam into a continuous stream of luminous blue holographic code, text, and floating data panels in a dark high-tech interior lit by blue neon.](./assets/images/easy-the-android-analyzes-the-validator-data_1280-640.jpeg "X1 Blockchain Validator Analytics")

[![Lint (JS+MD)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/x1-validator-analytics/ci.yml?branch=main&label=lint)](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/ci.yml)
[![Tests (Node 24/26)](https://img.shields.io/github/actions/workflow/status/nottoseethesun/x1-validator-analytics/ci.yml?branch=main&label=tests)](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/github/actions/workflow/status/nottoseethesun/x1-validator-analytics/security-audit.yml?branch=main&label=security)](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/security-audit.yml)

## Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

A script that reads what an X1 validator has earned: every inflation
reward its vote account received, each priced in USD at its own time,
written to a CSV file with running totals, and a summary beside it.

### Current Roster of Utilities

- fetch-total-validator-earnings.js

#### Sample Output

The two CSV files a run writes, opened in Google Sheets, Google's
spreadsheet app: the rewards, each with its price and the running totals,
and the summary.

![Validator Rewards with Prices](./readme-images/xnt-rewards-with-prices.png)
![Validator Rewards Analytics](./readme-images/xnt-rewards-analytics.png)

## Prerequisites

Node 24 or later: the program that runs JavaScript outside a browser, on
which the script runs.

## Installation

npm, Node's package manager, installs the packages `package.json` lists
and runs the repo's commands. From the repo's top folder:

```bash
npm install
```

It installs everything the script needs, among it, from GitHub, the
website that hosts the owner's code,
crypto-price-fetchers, the owner's repo of code his projects share: its key
store, and its client of GeckoTerminal, a service that lists the pools of
decentralized exchanges with their prices, which prices XNT.

### Choosing Versions of Dependencies that are Raw Github Projects

This step is entirely optional: `npm install` already installs everything
the script needs.

crypto-price-fetchers is installed straight from its GitHub project,
rather than from the npm registry. `package.json` names it with a ref:
`#main`, its main branch, which this repo follows, or `#semver:*`, its
latest release, its highest version tag. `package-lock.json` keeps the
commit the ref named when the lockfile was made, and `npm ci` installs
that commit.

crypto-price-fetchers also holds the tool that moves it: its versions tool,
which this repo runs as `npm run github-project-deps`. To move to the newest
commit of main, or to switch to the latest release:

```bash
npm run github-project-deps -- main
npm run github-project-deps -- release
```

Each sets the ref, then makes `package-lock.json` again from a fresh
`node_modules`, so the newest commit of main, or the newest release, is
installed. If the install fails, as it does for a release whose top folder
has no package.json, `package.json` and `package-lock.json` go back as they
were, and `node_modules` is installed again from them.
`npm run github-project-deps -- --help` says more.

### Api keys

The script sends no api key today: GeckoTerminal and the X1 endpoint take
none. Should a service that takes one be added, its key is kept in
`api-keys.json` here, which git, the version-control program that keeps
the repo's history, ignores, encrypted with a password you
choose, by crypto-price-fetchers' key store, which keeps keys as LP Ranger,
the owner's bot that manages his 9mm V3 liquidity positions, keeps its own.
The top `config.json` lists the services under `apiKeys`; this repo's
`npm run api-keys` runs the store's key manager, which lists their keys,
never showing their characters, and saves each one asked for; and
`source ./unlock-api-keys.sh`, a script in the repo's top folder, keeps the
password for a terminal. A key is never a setting in a file, nor a
command-line argument.

## Usage

`node fetch-total-validator-earnings.js --help`, or
`npm start -- --help`, lists every option, with examples of its common
uses and its exit codes. The run needs only the vote account's public key:

```bash
npm start -- --vote-pubkey <vote-account>
```

Each reward is priced in USD at its own time, from GeckoTerminal's hourly
candles for the configured pool of XDEX, a decentralized exchange on X1,
WXNT / USDC.X. GeckoTerminal's X1 candles start on 2026-10-01, and its
public api serves the last 180 days, so a reward before either has empty
price and value cells, with a warning. Amounts keep all nine of XNT's
decimal places.

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
  tests and CI, the checks GitHub Actions, GitHub's service for running
  them, runs at each push.
- [`docs/npm-project-commands.md`](docs/npm-project-commands.md): every npm
  command.

## Contributing

Fork me on GitHub. :) Contributions are welcome but note that any
contributions are subject to the license as defined in the LICENSE file
here.

To be accepted for pull request:

- All tests must pass
- Any major new functionality must have a test runnable from the current approach
- All code must be modular e.g. low cyclomatic complexity ~17 or so.
