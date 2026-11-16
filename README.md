# X1 Blockchain Validator Analytics

## Overview

USE AT YOUR OWN RISK: SEE LICENSE FILE, INCLUDED.

Utilities for reading and summarizing X1 blockchain data about X1 network validators.

### Current Roster of Utilities

- fetch-total-validator-earnings.js

#### Sample Output

![Validator Rewards with Prices](./readme-images/xnt-rewards-with-prices.png)
![Validator Rewards Analytics](./readme-images/xnt-rewards-analytics.png)

## Prerequisites

NodeJS 24.9.x - Earlier versions may work.

## Installation

`npm install`

### Usage

Refer to the module or file header documentation.

Each reward is priced in USD at its own time, from GeckoTerminal's hourly
candles for the configured XDEX pool, WXNT / USDC.X. GeckoTerminal's X1
candles start on 2026-10-01, so an earlier reward has empty price and value
cells, with a warning. Amounts keep all nine of XNT's decimal places.

## Development

### Test

The tests ask nothing outside your computer.

```bash
npm ci
npm test
```

[`test/README.md`](./test/README.md) describes them.

## Contributing

Fork me on GitHub. :)  Contributions are welcome but note that any contributions are subject to the license as defined in the LICENSE file here.

To be accepted for pull request:

- All tests must pass
- Any major new functionality must have a test runnable from the current approach
- All code must be modular e.g. low cyclomatic complexity ~17 or so.

[![Tests](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/test.yml/badge.svg)](https://github.com/nottoseethesun/x1-validator-analytics/actions/workflows/test.yml)
