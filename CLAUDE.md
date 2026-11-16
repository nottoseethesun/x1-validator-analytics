# x1-validator-analytics — notes for Claude

## Conventions

Follow LP Ranger's coding standards: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

## Prices

Each reward's USD price is XNT's price in USDC.X, from GeckoTerminal's hourly
candles for the configured pool, asked in the pool's own rate
(`currency=token`). GeckoTerminal's USD candles for XNT (`currency=usd`) show
one fixed price at every hour, so they are never used. GeckoTerminal's X1
candles start on 2026-10-01; an earlier reward gets an empty price cell and a
warning, never a stand-in price. `xnt-price.js` explains the rest.

## Tests

The tests are in `test/`, on Node's own test runner, and ask nothing outside
the computer: the script runs against a stand-in X1 endpoint and a stand-in
GeckoTerminal served locally. `test/README.md` lists them.

```bash
npm ci
npm test
```

The live chain gives a block time for every one of the validator's rewards, so
the script's date estimate, which assumes 24-hour epochs where X1's run about
22 hours, never runs. That was checked over the full history on 2026-11-10.

## Known bugs

None is known. When one is found, it gets a test in
`test/known-bugs.test.js`, declared with `knownBug`
(`test/helpers/known-bug.js`), so the test passes while the bug is present.
The bug's fix makes its test fail; declare that test with `it` instead, in the
same change, among the tests of the code it is about.
