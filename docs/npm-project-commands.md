# x1-validator-analytics — `npm` Project Commands

Every npm command of x1-validator-analytics, the owner's tool that reads an
X1 validator's rewards and prices them in USD, as its `package.json` defines
them, run from the repo's top folder, with what each does and what to type.
Two of them run tools of crypto-price-fetchers, the owner's repo of code his
projects share, which this repo installs from GitHub: `api-keys` and
`github-project-deps`.

Companion to [`docs/engineering.md`](engineering.md), which covers how the
gates work. This file covers how to drive them.

---

## Table of Contents

- [Passing Flags](#passing-flags)
- [Running the Script](#running-the-script)
- [Api Keys](#api-keys)
- [Dependency Versions](#dependency-versions)
- [Developer Tools](#developer-tools)
- [Test](#test)
- [Commands That Are Usually Not Run Alone](#commands-that-are-usually-not-run-alone)
- [See Also](#see-also)

---

## Passing Flags

Run with `npm run <name>`; `start` and `test` also work without `run`. Flags
go after a `--` separator, which tells npm the rest belongs to the script,
as in these two commands: the first reads a vote account's rewards over its
last 20 epochs ([Running the Script](#running-the-script)), and the second
runs the tests whose names hold `xnt-price` ([Test](#test)):

```sh
npm start -- --vote-pubkey <vote account> --epochs 20
npm test -- --test-name-pattern="xnt-price"
```

---

## Running the Script

The script reads a vote account's rewards and writes the reports. One
command runs it.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `start` | `--vote-pubkey` (required), `--rpc-url`, `--liquidity-pool-address`, `--output`/`-o`, `--epochs`/`-n`, `--verbose`/`-v`, `--json` | Read the vote account's rewards and write the reports. The file header of `fetch-total-validator-earnings.js` describes each flag. | `npm start -- --vote-pubkey <vote account> --json` |

---

## Api Keys

The script sends no api key today, but the repo has the key manager ready,
should a service that takes one be added.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `api-keys` | `set <service>`, `check-password`, `--help` | The key manager, crypto-price-fetchers'. Lists each key the top `config.json` names, saved or not, never showing a key's characters, and asks for each one not saved. It names none today. | `npm run api-keys` |

---

## Dependency Versions

crypto-price-fetchers is installed from GitHub, at the commit
`package-lock.json` keeps. One command, entirely optional, moves it.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `github-project-deps` | `main` or `release`; `--help` | crypto-price-fetchers' versions tool. Sets every dependency installed from GitHub to its project's main branch (`#main`) or latest release (`#semver:*`), then makes `package-lock.json` again from a fresh `node_modules`, so the newest commit of main, or the newest release, is installed. When the install fails, it puts `package.json` and `package-lock.json` back and installs `node_modules` again from them. | `npm run github-project-deps -- main` |

---

## Developer Tools

These commands check or fix the form of the code: `lint` runs the checks,
and `format` and `lint:fix` make the fixes the tools can make.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `format` | — | Prettier's write pass over every JavaScript, JSON and YAML file. | `npm run format` |
| `knip:files` | — | The dead-code check: fails on any file nothing reaches. `lint` runs it. | `npm run knip:files` |
| `lint` | — | The linters: ESLint, markdownlint, Prettier in check mode, actionlint, and knip's unused files. husky, the package that runs scripts at git's hooks, runs it before each commit. | `npm run lint` |
| `lint:fix` | — | ESLint and markdownlint with their fixes, then `format`. | `npm run lint:fix` |

---

## Test

These commands run the gates: the tests and the audits. `check` runs all of
them, after the lint, and must pass before a commit and a push.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `audit:deps` | — | `npm audit` at the `high` threshold over the packages that ship (`--omit=dev`). | `npm run audit:deps` |
| `audit:secrets` | — | secretlint across the repo. | `npm run audit:secrets` |
| `audit:security` | — | The security lint, `eslint-security.config.js`: eslint-plugin-security, eslint-plugin-no-secrets and `no-secret-logging`. | `npm run audit:security` |
| `check` | — | The full gate: `lint`, `test:coverage` and the three audits, in that order, stopping at the first that fails. | `npm run check` |
| `format:check` | — | Prettier in check mode; fails rather than rewriting. | `npm run format:check` |
| `test` | any `node --test` flag | The tests, on Node's test runner. | `npm test -- --test-name-pattern="rewards"` |
| `test:coverage` | — | The same tests with coverage, failing below 80% of lines covered. | `npm run test:coverage` |

---

## Commands That Are Usually Not Run Alone

npm runs this command itself, after another one.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `prepare` | — | Runs after `npm install`; installs the husky hooks. | automatic |

---

## See Also

- [`docs/engineering.md`](engineering.md) — the gates, the tests and CI.
- [`docs/architecture.md`](architecture.md) — how the script works.
- [LP Ranger's `docs/claude/CLAUDE-CI.md`](https://github.com/nottoseethesun/lp-ranger/blob/main/docs/claude/CLAUDE-CI.md)
  — the merge protocol these gates feed.
