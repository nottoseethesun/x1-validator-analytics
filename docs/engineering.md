# x1-validator-analytics — Engineering Reference

The files the script reads and writes, the gates every change passes, the
tests, and CI: the same gates, run at each push by GitHub Actions, the
service of GitHub, the website that hosts the repo. For how the script works, see
[`docs/architecture.md`](architecture.md); for how it decides each
reward's price, see
[`docs/price-determination-rules.md`](price-determination-rules.md); for
every command, those the repo's `package.json` gives npm, the package manager of Node, the program
that runs JavaScript outside a browser, to run and those run with `node`
or `source`, see [`docs/project-commands.md`](project-commands.md).

The repo follows the coding standards of LP Ranger, the owner's bot that
manages his 9mm V3 liquidity positions: its `CLAUDE.md` and
`docs/claude/`, in
[nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Files on Disk](#files-on-disk)
- [The Unlock Script](#the-unlock-script)
  - [Usage](#usage)
  - [In zsh, by Hand](#in-zsh-by-hand)
- [The Gate: `npm run check`](#the-gate-npm-run-check)
- [Lint](#lint)
- [Tests](#tests)
  - [Test Files](#test-files)
  - [Test Helpers](#test-helpers)
- [Security Audits](#security-audits)
- [Dead Code Detection](#dead-code-detection)
- [CI and Branch Protection](#ci-and-branch-protection)
- [Known Bugs](#known-bugs)

---

## Quick Start

The repo supports two major versions of Node: the newest LTS (long-term
support) version, today 26, and the version two majors before it, today
24. Every tool, every test and every npm command runs on both, and CI runs
the gate on each (below).

A working copy needs Node 24 or later and the repo's packages. From the
repo's top folder:

```bash
npm ci
npm run check
```

`npm ci` installs crypto-price-fetchers, the owner's repo of code his
projects share, too, from GitHub, at the commit `package-lock.json` keeps
for its main branch: no other step installs it. Its versions tool, which
this repo runs as `npm run github-project-deps`, moves it: `-- main` to
main's newest commit, and `-- release` to its latest release (see
[crypto-price-fetchers](architecture.md#crypto-price-fetchers)).

---

## Files on Disk

The script and its tests read and write these files. Git, the version-control program that keeps the repo's history, keeps
only the
settings; the keys and the reports stay on the owner's computer.

| File | In git | What it holds |
| ---- | ------ | ------------- |
| `config.json` | yes | The script's settings, over the defaults in `settings/configLoader.js`, and the services whose keys the programs send, under `apiKeys`: none today. Checked against its JSON Schema, `SETTINGS_SCHEMA` in `settings/configLoader.js`, before the script takes a setting. |
| `config-example.json` | yes | What `config.json` holds, as the example of its settings that every `config.json` has beside it. |
| `api-keys.json` | no | Api keys, encrypted with the owner's password, should a service that takes one be added. |
| `output/csv/` | `.gitkeep` alone | The reports, `xnt_rewards_with_prices.csv`, unless `--output` names another file, and `xnt_rewards_analytics.csv`. |
| `output/json/` | `.gitkeep` alone | The reports as JSON, `xnt_rewards.json` and `xnt_rewards_analytics.json`, with `--json`. |

A folder git keeps by its `.gitkeep` alone holds the owner's own data:
git ignores everything in it but that empty file, which keeps the folder
in the repo, and the format check and the secret scan pass over it.

---

## The Unlock Script

The key store of crypto-price-fetchers keeps a project's api keys in
`api-keys.json`, encrypted with one password, and its key manager,
`bin/end-user/manage-api-keys.js`, which `npm run api-keys` runs, saves
and lists them.
`bin/unlock-api-keys.sh` asks for the key store's password once, showing
nothing of what is typed, checks that it opens the keys saved, and keeps
it for the terminal in `API_KEYS_PASSWORD`, so a program opens its keys
without asking; the script sends no key today. It runs in bash or zsh,
the default shell of macOS, and with `source`, since a script run as a
program cannot set anything in the terminal that started it; no program
runs it. It is a copy of crypto-price-fetchers' script, which
`test/api-keys.test.js` holds it to, so a change to it is made there. It
finds the repo's top folder as the one above its own, and runs the key
manager there, at `bin/end-user/manage-api-keys.js`. From the repo's top
folder:

```bash
source ./bin/unlock-api-keys.sh
```

### Usage

From any other folder, by the script's path:

```bash
source /path/to/x1-validator-analytics/bin/unlock-api-keys.sh
```

Its help, which asks nothing and keeps no password:

```bash
source ./bin/unlock-api-keys.sh --help
```

Closing the terminal forgets the password, as does
`unset API_KEYS_PASSWORD`.

### In zsh, by Hand

The script finds the repo's folder by a different line in bash and in
zsh. crypto-price-fetchers' tests source its copy in bash, and, run by
hand, in zsh ([In zsh, by Hand](https://github.com/nottoseethesun/crypto-price-fetchers/blob/main/docs/engineering.md#in-zsh-by-hand), in its
`docs/engineering.md`, says how), in the same place beside its key
manager as here; the tests here run only the script's help, in bash: the
automated tests rely on Node and on programs every computer they run on
has, bash, git and the programs a shell script calls, such as cat,
and zsh is not on every such computer (Debian and Ubuntu, for example, do
not install it), so, by the owner's rule, its steps are run by hand. To
check this copy in zsh, on a computer with zsh, such as a Mac, start zsh,
and from the repo's top folder:

1. Run `source ./bin/unlock-api-keys.sh --help`. It prints its help, and
   asks nothing.
2. Run `zsh ./bin/unlock-api-keys.sh`, which runs it as a program. It
   says "Run it with source, so it can keep the password in this
   terminal:", and `echo $?` prints 1.
3. Run `cd ~`, then source the script by its whole path, as
   `source /path/to/x1-validator-analytics/bin/unlock-api-keys.sh`. Its
   question names the folder the repo is in, as "Password for the api
   keys of x1-validator-analytics:", which shows that zsh's line found
   the folder. Press Enter alone: it says "No password was typed, so none
   is kept.", and `echo $?` prints 1.
4. Source it again, and type any password, which shows nothing typed. No
   key is saved here, since the script sends none today, so any password
   is kept: it says that no key is saved, then "API_KEYS_PASSWORD is set
   for this terminal.", and `echo $?` prints 0. Run
   `unset API_KEYS_PASSWORD` to forget it.

---

## The Gate: `npm run check`

`npm run check` runs every gate, in order, and stops at the first that
fails: the lint, the tests with coverage, then the four security audits. It
must pass before every commit and push, and CI runs it on Node 26, the
newest LTS (long-term support) version, and on Node 24, the oldest the repo
supports.

---

## Lint

The lint checks each file's form before any test runs: the rules the code
follows, its formatting, the workflows, and files nothing uses.
`npm run lint` runs five tools: four npm packages, and actionlint, a
program its author publishes for each system, which the table's fourth
row explains:

| Tool | Configured in | What it does, and what it holds the repo to |
| ---- | ------------- | ------------------------------------------- |
| ESLint | `eslint.config.js` | Checks JavaScript against rules: LP Ranger's, with no warning allowed: cyclomatic complexity ≤ 17, ≤ 500 lines of code a file (blank lines and comments not counted), lines ≤ 80 characters but strings, template literals, regular expressions, urls and comments, `===`, no unused name, no `var`, `const` where nothing is reassigned, no `Math.random`, no comment that tells Prettier, the formatter in the row below, to skip code, and every import resolved. And `no-or-default`, crypto-price-fetchers' rule against `a \|\| b` whose value is kept, as a default is, when `b` is no boolean: `\|\|` takes its fallback for every falsy value, so a default is written with `??` or an explicit check. |
| markdownlint | `.markdownlint-cli2.jsonc` | Checks the form of Markdown files, with LP Ranger's settings, over every Markdown file. |
| Prettier | `.prettierrc`, `.prettierignore` | Formats code; in check mode, it fails when its formatting would change any JavaScript, JSON or YAML file. |
| actionlint | crypto-price-fetchers' `actionlint/release.js` | Checks the GitHub Actions workflow files, in `.github/workflows/`, for mistakes in their syntax, their expressions and the shell scripts their steps run. The lint runs the official release of actionlint, rhysd's program, through `run-actionlint`, a bin of crypto-price-fetchers: the first run downloads the archive for its system, refuses it unless its SHA-256 is the one crypto-price-fetchers pins, and keeps the program in `node_modules/.cache/actionlint/`, which later runs use. |
| knip | `knip.json` | Finds files outside `test/` that nothing imports or runs, and fails on any. See [Dead Code Detection](#dead-code-detection). |

husky, a package that runs scripts at git's hooks, runs `npm run lint`
before each commit (`.husky/pre-commit`); this repo's `prepare` script
installs the hook at `npm install`. `npm run format` or `npm run lint:fix`
fixes formatting. No rule is ever switched off in a file, no file is left
out of the lint, and a file over 500 lines is split, not excused.

---

## Tests

The tests are in `test/`, on Node's test runner, and ask nothing outside
the computer: the script runs against a stand-in X1 endpoint and a
stand-in GeckoTerminal, the service it takes prices from, which it asks
through crypto-price-fetchers' client, both served on this computer, in a
temp folder of its own that is removed afterwards, so nothing is written
into the repo. From the repo's top folder, after `npm ci`, `npm test`
runs them all, and `node --test --test-timeout=60000 test/xnt-price.test.js`
one file; `npm run test:coverage` fails below 80% of lines covered, and
`npm run check` runs it after the lint and before the security audits,
as CI does. Code written to check something goes into the tests, so it
is kept and run again rather than written again.

`npm test` and `npm run test:coverage` pass `--test-timeout=60000` to
Node's test runner, so a test or hook still running after a minute fails,
by name, and the rest of its file runs: on Node 24 and 26, a test whose
promise never settles would otherwise keep its file running until the
run is stopped. The limit is per test, a minute, as in LP Ranger; the
slowest test today takes up to about 5 seconds, on a computer and
on CI. It cannot end a test that
waits for a child process synchronously, as `spawnSync` does, which holds
its file's thread, nor a test file that leaves a timer running, whose
process never exits: [CI and Branch Protection](#ci-and-branch-protection)
says how CI ends those, and a run on a computer waits until it is
stopped. `--test-force-exit`, which would end such a file, is left out,
since it would hide the timer left running.

### Test Files

Four test files run the whole script, `fetch-total-validator-earnings.test.js`, `hour-not-over.test.js`, `refused-settings.test.js` and `run-output.test.js`; each of the others tests one part of it.

| File | What it checks |
| --- | --- |
| `fetch-total-validator-earnings.test.js` | The real script, run in a child process: one row per reward, oldest first, amounts and the XNT running total exact to nine decimal places, each price the close of its own hour's candle in the pool's own rate, values and the USD running total, a reward before GeckoTerminal's first candle left unpriced, with a warning, the failures of epochs 0 to 15 counted as expected, the json export, its summary's date range under `dateRange`, a run with no prices when GeckoTerminal refuses, a verbose run, which prints each epoch's raw answer and the current epoch's first slot, and still finds every reward, an account that began at epoch 20, whose epochs with no reward are counted apart from its failed query, whose share of expected epochs with a reward counts from its first reward, and whose json export names that first reward's epoch, an endpoint that does not answer and one that stops in the middle of its answer, each given up on after `requestTimeoutSeconds`, a block time asked again twice, 2 seconds apart, the run going on when the third request answers, and a chain that gives no block time for a reward in three requests, which stops the run with exit code 1, naming the epoch |
| `hour-not-over.test.js` | The real script, run in a child process against a stand-in chain whose present is two hours ahead of the computer's clock, so its newest reward falls in an hour not over while the script runs: that reward left with empty price and value cells, counted among the rewards without a price, and warned of apart, as a reward a run once the hour is over prices, the other rewards priced, and exit code 0 |
| `refused-settings.test.js` | The real script, given an option or a `config.json` it refuses: a wrong public key or url, or an empty `--output`, refused, naming its option; a `config.json` that is not JSON, a time limit that is no whole number of seconds from 1 to 2147483, an `epochs` that is no whole number above 0, and a key no setting has, refused with every problem listed; each with exit code 1, before the chain is asked; and `--help` answered with exit code 0 when `config.json` is refused |
| `run-output.test.js` | The real script, run in a child process: a run whose output's reader stops reading after the first line, as `head -1` does, ending with exit code 1 and no file written; an `--output` whose folder does not exist or takes no new file, or that is a folder, and a run in a folder without `output/csv/`, or without `output/json/` with `--json`, or whose `output/csv/` takes no new file, each refused before the chain is asked anything, a folder that takes no new file shown with `/proc` where there is one; the progress bar counting out of the epochs there are when `--epochs` asks for more; and `--no-verbose` turning off a `verbose` that `config.json` sets |
| `config-loader.test.js` | The settings (`settings/configLoader.js`): the repo's `config.json` held to the schema, each setting laid over its default, the defaults, with a notice, without a `config.json`, and a key no setting has and values of the wrong kind refused, listing every problem, a time limit Node's timers cannot keep among them; the public keys of `settings/public-key.js`; and `config.json` holding only settings a program reads |
| `xnt-price.test.js` | The candles asked of crypto-price-fetchers' GeckoTerminal client, in the pool's own rate of XNT, from a day before the earliest time, a thousand hours at a time, its refusals and the waits after a 429, the check of the pool's pair, each time's price from the close of its candle, a time in the hour not yet over given no price and counted, as is one whose hour ends while the candles are asked, and a time up to about 220 days old priced from the page asked at the edge of the public api's 180 days |
| `xnt-amount.test.js` | Writing lamports as XNT with all nine decimal places |
| `rewards.test.js` | The report's rows, the epochs counted by outcome, the summary and the analytics metrics |
| `csv-writer.test.js` | The rewards CSV and the analytics CSV, each starting with a UTF-8 BOM and ending with one newline, after its last row, and the labels of the reward dates and their range |
| `api-keys.test.js` | The keys `config.json` lists, none today, the key manager, which saves and lists the api keys, and the copy of crypto-price-fetchers' `bin/unlock-api-keys.sh`, the script that keeps the password for a terminal ([The Unlock Script](#the-unlock-script)) |
| `command-line-help.test.js` | Every command line's help, `--help` and `-h`, and its help into a pipe closed before it is written, which must end with exit code 0 and nothing on stderr: the script's, the key manager's, `bin/unlock-api-keys.sh`'s, run with bash, and those of the bins of crypto-price-fetchers the npm targets run, its versions tool and `run-actionlint`, each with its options, examples and exit codes, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/command-line-help`); and that its list holds every command line the repo runs, every bin of crypto-price-fetchers among them |
| `repo-checks.test.js` | The repo's tracked files, by crypto-price-fetchers' checks (`crypto-price-fetchers/lib/repo-checks`): every EVM address in EIP-55's form, every npm target named in `docs/project-commands.md`, every test file and helper named in `docs/engineering.md` or in `CLAUDE.md`, every link in a doc, and every path in a code span that starts at the doc's own folder, pointing at a file, folder or heading the repo keeps, and a `config-example.json` beside `config.json`, holding what it holds; and that git ignores the owner's files in `output/` |
| `dependencies.test.js` | crypto-price-fetchers installed from GitHub, following its main branch or its latest release, and `npm run github-project-deps` running its versions tool |

### Test Helpers

- `test/helpers/stand-in-x1.js` serves a stand-in X1 json-rpc endpoint: a chain
  at a time and epoch the test names, paying the same reward every epoch,
  with the account's credits for the last five epochs, as `getVoteAccounts`
  gives them. When the test says so, it answers with no reward for some
  epochs, as X1's endpoint does for an epoch before an account began or one
  it missed; fails the query of others, as X1's does for epoch 15, after
  its chain was rolled back early in its life; fails the first
  `getBlockTime` requests, as many as the test says, counting every one it
  takes; answers nothing at all; or answers each request with its headers
  and the start of a body, and sends no more, as an endpoint whose
  connection hangs does (`stopsInBody`). It counts every request it
  answers, of any method.
  `rewardSeconds` gives an epoch's reward time.
- `test/helpers/stand-in-gecko-terminal.js` answers for a pool's hourly candles
  as GeckoTerminal does, as a fetch or served on a local port. Each candle
  closes at the test's price, with an open, a high and a low apart from it,
  so a test tells the close from the rest. Asked in USD, it gives one fixed
  price at every hour, as GeckoTerminal does for X1. It can refuse with 401
  a before-time older than one it is given, as the public api refuses one
  older than 180 days.
- `test/helpers/run-script.js` runs the script against both stand-ins, in a
  temp folder whose `config.json` the test writes, as settings or as text
  that need not be JSON, with `output/csv/` and `output/json/` unless the
  test names other folders, or links to folders in their place, and reads
  the files it wrote. `startStandIns` starts both stand-ins, the chain
  paying 1.234567891 XNT an epoch, at 12:00 UTC on 2026-11-10 unless the
  test gives another time, and GeckoTerminal with the market the test
  makes from the chain, such as candles at its reward times, made with
  `hourOf` and `flatCandles`. The four test files that run the whole
  script start their stand-ins with it, save the test of a `config.json`
  that is not JSON, whose run asks no GeckoTerminal, so it starts the
  stand-in chain alone (`startStandInX1`).
- `test/helpers/known-bug.js` declares a test of a known bug ([Known Bugs](#known-bugs)).

---

## Security Audits

Four audits look for security problems: in the packages the repo
installs, through npm audit, npm's check of installed packages against
known vulnerabilities; in the release of actionlint the lint runs; in the
code, through ESLint with security rules; and in the text of every file,
through secretlint, which looks for keys and credentials.

| Command | What it runs | What it catches |
| ------- | ------------ | --------------- |
| `npm run audit:deps` | `npm audit --audit-level=high --omit=dev`, then `npm run audit:actionlint` | Known vulnerabilities, of high severity or worse, in the packages that ship; then what the next row says. |
| `npm run audit:actionlint` | `run-actionlint --check`: downloads every archive of the actionlint release crypto-price-fetchers pins | An archive that cannot be downloaded, or whose SHA-256 differs from the one pinned. npm audit does not cover actionlint, which is no npm package; the lint makes the same check on the one archive it runs. |
| `npm run audit:security` | ESLint with `eslint-security.config.js` | Code open to attack (eslint-plugin-security), strings that look like keys (eslint-plugin-no-secrets), and printing a name that may hold a secret (`no-secret-logging`, from crypto-price-fetchers). |
| `npm run audit:secrets` | secretlint, with `.secretlintrc.json` and `.secretlintignore` | Keys and credentials in any file. |

The security lint follows LP Ranger's: no warning allowed, with
`detect-non-literal-fs-filename` and `detect-object-injection` off.
no-secrets passes the public X1 addresses the code names, listed in the
config as `PUBLIC_ADDRESSES`, which are base58 and look random to it.

---

## Dead Code Detection

A file nothing in the repo uses is dead code. knip finds such a file: it
follows the imports from each entry point, a file that a program or a test
starts from, and reports any file it never reaches. `npm run knip:files`
fails on one, as in LP Ranger. knip finds the script itself in
`package.json`; `knip.json` adds the security config and the tests.
knip's plugin for Node's test runner, which `npm test` runs, also takes
every file under `test/` as an entry point, so knip reports no file
there: `test/helpers/known-bug.js`, which nothing imports while no bug is
known, among them. Unused
exports are not gated.

---

## CI and Branch Protection

CI runs the gate again on GitHub, so a change reaches `main` only after it
passes there too. Two workflows run on every push to `main`, every pull
request to `main`, and by hand:

| Workflow | Job | Runs |
| -------- | --- | ---- |
| `ci.yml` | check-latest-nodejs-lts (Node 26), check-oldest-nodejs-supported (Node 24) | `npm run check`. |
| `security-audit.yml` | Dependency Audit, Security Lint, Secret Scan | Each audit as a job of its own; Dependency Audit runs `npm run audit:deps`, so the check of actionlint's archives with it. |

The two checks of `ci.yml` are named for their roles, not their Node
versions, so moving to newer versions renames no check. Each stops at 20
minutes (`timeout-minutes`), where it takes under two, which ends a hang
no test's time limit can ([Tests](#tests)).

`main` is protected: a change reaches it only by a pull request whose five
checks, those five jobs, have passed. Force pushes and deletion are
refused. Merges are merge commits, never squashed, and no branch is
deleted. The steps from a branch to `main` are LP Ranger's eight, in its
`docs/claude/CLAUDE-CI.md`.

---

## Known Bugs

None is known. A bug found gets a test in `test/known-bugs.test.js`,
declared with `knownBug` (`test/helpers/known-bug.js`), so the test passes
while the bug is present. The bug's fix makes its test fail; the same change
declares the test with `it`, among the tests of the code it is about.
