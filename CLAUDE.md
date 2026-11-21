# x1-validator-analytics — notes for Claude

## Conventions

Follow the coding standards of LP Ranger, the owner's bot that manages his
9mm V3 liquidity positions: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

The repo's programs run on Node, the program that runs JavaScript outside a
browser; npm, Node's package manager, installs their packages and runs the
commands `package.json` names; git, the version-control program, keeps the
repo's history, on GitHub, the website that hosts it.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

**Never show any character of an api key once it is entered**: not in a
reply, a log line, an error message, a test's output, or a listing.

## Prices

Each reward's USD price is XNT's price in USDC.X, from the hourly candles of
GeckoTerminal, a service that lists the pools of decentralized exchanges
with their prices and candles, for the configured pool, asked in the pool's
own rate (`currency=token`). GeckoTerminal's USD candles for XNT
(`currency=usd`) show one fixed price at every hour, so they are never used.
GeckoTerminal's X1 candles start on 2026-10-01, and its public api serves
the last 180 days; a reward before either gets an empty price cell and a
warning, never a stand-in price. The GeckoTerminal client
(`crypto-price-fetchers/dex-prices/geckoterminal`) of crypto-price-fetchers,
the owner's repo of code his projects share, which this repo installs
(below), asks for the candles and finds each price, within its budget of
requests and with its waits after a 429; this repo keeps no client of its
own. `xnt-price.js` explains the rest.

## Keys

The script sends no api key today. Should it come to, the key is kept as
crypto-price-fetchers' key store keeps keys
(`crypto-price-fetchers/api-key-store`): the service is listed in the top
`config.json` under `apiKeys`, `npm run api-keys` runs the manager
(`manage-api-keys.js`), and `source ./unlock-api-keys.sh`, a script at the
repo's top, keeps the password for a terminal. `unlock-api-keys.sh` is a
copy of crypto-price-fetchers', which a test holds it to; a change to it is
made there. A key is never a setting in a file git keeps, nor a command-line
argument.

## crypto-price-fetchers

`package.json` installs crypto-price-fetchers from GitHub, following its
main branch (`#main`); `package-lock.json` keeps the commit installed.
crypto-price-fetchers' versions tool, which this repo runs as
`npm run github-project-deps -- main|release`, sets the ref to `#main` or
`#semver:*` (the latest release) and makes the lockfile again; the tool
lives there, and this repo keeps no copy. `test/dependencies.test.js` holds
both to that.

## Docs

`docs/architecture.md` says how the script works, `docs/engineering.md`
covers the files, the gates, the tests and CI (the gates, run by GitHub
Actions at each push), and
`docs/npm-project-commands.md` lists every npm command, as LP Ranger's
`docs/` does. A change keeps them true.

Every doc passes the owner's documentation audit: it tells no story of an
old bug, leads every topic and sub-topic with the context it needs,
introduces each tool where it first names it, explains with facts rather
than adjectives, and leaves out no step in the logic of an explanation. A
tool is anything a reader runs or a program uses: an `npm run` command, a
bin, a script, a package or an outside service. Its introduction starts
from the big picture, gives a few words of context or a scenario where the
tool is used, says which codebase it comes from, and says what it does in
precise words.

## Command lines

Every command line in this repo answers `--help`, and `-h`, with all it
takes and how to use it: each option and argument with what it does, then
examples of its common uses, each a full command and what it does, and its
exit codes. An npm target that runs one passes the flag through, as
`npm run <target> -- --help`. Each is declared with commander, the package
that parses command lines, so the options its help lists come from the
declaration the program parses; the examples and exit codes go in the
help's closing text (`addHelpText("after", …)`).
`docs/npm-project-commands.md` lists every npm target, including those
that run other tools, such as `lint` and `check`, with its flags and an
example. LP Ranger's rules do not yet ask for the examples; this repo does.

## Gates and CI

`npm run check` is the one gate, LP Ranger's: the lint (ESLint, which checks
JavaScript against rules, here LP Ranger's; markdownlint, which checks the
form of Markdown files; Prettier, which formats code; actionlint, which
checks the GitHub Actions workflow files; and knip, which finds files
nothing uses), the tests with at least 80% of lines covered, and the
security audits (npm audit, npm's check of the installed packages against
known vulnerabilities; the security lint in `eslint-security.config.js` with
crypto-price-fetchers' `no-secret-logging`, a rule that refuses printing a
name that may hold a secret; and secretlint, which looks for keys and
credentials in files). It must pass before a commit and a push; husky, the
package that runs scripts at git's hooks, runs `npm run lint` before each
commit. CI runs `npm run check` on both supported versions of Node (below),
in `ci.yml`, and each audit as a job of its own (`security-audit.yml`).
`main` is protected: those five checks must pass on a pull request, never
squashed, and no branch is deleted. LP Ranger's eight steps in
`docs/claude/CLAUDE-CI.md` take a change to `main`.

## Supported versions of Node

The repo supports two major versions of Node: the newest LTS (long-term
support) version, today 26, and the version two majors before it, today 24.
Every tool and test runs on both. `engines` in `package.json` names only the
oldest supported major as a minimum, `>=24`, raised to a minor version, such
as `>=24.15`, only when the code needs what that version added; no file pins
or requires one exact version of Node.

CI runs the gate on each, as two checks named for their roles, never for
their versions: `check-latest-nodejs-lts` and
`check-oldest-nodejs-supported`, in `ci.yml`. Moving to newer versions
changes the two `node-version` values there, `NODE_VERSION` in
`security-audit.yml`, `engines` and the docs, but never a check's or a
file's name, so `main`'s required checks stay as they are.

## Tests

The tests are in `test/`, on Node's own test runner, and ask nothing outside
the computer: the script runs against a stand-in X1 endpoint and a stand-in
GeckoTerminal served locally. `test/README.md` lists them.

```bash
npm ci
npm run check
```

When the chain gives no block time for a reward's slot, the script falls
back to an estimate of the reward's date, which assumes 24-hour epochs
where X1's run about 22 hours. The live chain gives a block time for every
one of the validator's rewards, so the estimate never runs. That was
checked over the full history on 2026-11-10.

## Known bugs

None is known. When one is found, it gets a test in
`test/known-bugs.test.js`, declared with `knownBug`
(`test/helpers/known-bug.js`), so the test passes while the bug is present.
The bug's fix makes its test fail; declare that test with `it` instead, in the
same change, among the tests of the code it is about.
