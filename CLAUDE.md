# x1-validator-analytics — notes for Claude

## Conventions

Follow LP Ranger's coding standards: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

## Tests

The tests are in `test/`, on mocha, with their own `package.json`.

```bash
npm ci
cd test
npm ci
npm test
```

Every test but `test-known-bugs.js` runs the script against the live chain, at
`https://rpc.mainnet.x1.xyz`; a Claude session needs that domain allowed in its
network settings. The full-history test, `npm run test:full`, takes about two
minutes. `npm run test:known-bugs` asks nothing outside the computer: it runs
the script against `test/helpers/stand-in-x1.js`, a stand-in X1 endpoint served
locally.

The live chain gives a block time for every one of the validator's rewards, so
the script's date estimate, which assumes 24-hour epochs where X1's run about
22 hours, never runs. That was checked over the full history on 2026-11-10.

## Known bugs

`test/test-known-bugs.js` holds one test per known bug, declared with
`knownBug` (`test/helpers/known-bug.js`), so it passes while the bug is
present. A bug's fix makes its test fail; declare that test with `it` instead,
in the same change.

| Item | Bug |
| --- | --- |
| 6 | Every reward is valued at the $1.00 fallback price, and amounts are rounded to six decimal places, where XNT has nine. Summ's catalogue has no X1 XNT, so the USD values must come from this tool |
| 8 | The live tests depend on the network, and two of their assertions can never fail. This one has no known-bug test |
