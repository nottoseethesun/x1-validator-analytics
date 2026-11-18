# x1-validator-analytics — `npm` Project Commands

Every command defined in `package.json`, what it does, and what to type.

Companion to [`docs/engineering.md`](engineering.md), which covers how the
gates work. This file covers how to drive them.

---

## Table of Contents

- [Passing Flags](#passing-flags)
- [Running the Script](#running-the-script)
- [Api Keys](#api-keys)
- [Developer Tools](#developer-tools)
- [Test](#test)
- [Commands That Are Usually Not Run Alone](#commands-that-are-usually-not-run-alone)
- [See Also](#see-also)

---

## Passing Flags

Run with `npm run <name>`; `start` and `test` also work without `run`.
Flags go after a `--` separator, which tells npm the rest belongs to the
script:

```sh
npm start -- --vote-pubkey <vote account> --epochs 20
npm test -- --test-name-pattern="xnt-price"
```

---

## Running the Script

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `start` | `--vote-pubkey` (required), `--rpc-url`, `--liquidity-pool-address`, `--output`/`-o`, `--epochs`/`-n`, `--verbose`/`-v`, `--json` | Read the vote account's rewards and write the reports. The file header of `fetch-total-validator-earnings.js` describes each flag. | `npm start -- --vote-pubkey <vote account> --json` |

---

## Api Keys

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `api-keys` | `set <service>`, `check-password`, `--help` | The key manager, crypto-price-fetchers'. Lists each key the top `config.json` names, saved or not, never showing a key's characters, and asks for each one not saved. It names none today. | `npm run api-keys` |

---

## Developer Tools

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `format` | — | Prettier's write pass over every JavaScript, JSON and YAML file. | `npm run format` |
| `knip:files` | — | The dead-code check: fails on any file nothing reaches. `lint` runs it. | `npm run knip:files` |
| `lint` | — | The linters: ESLint, markdownlint, Prettier in check mode, actionlint, and knip's unused files. The husky pre-commit hook runs it. | `npm run lint` |
| `lint:fix` | — | ESLint and markdownlint with their fixes, then `format`. | `npm run lint:fix` |

---

## Test

The gates. `check` runs all of them and is what must pass before a commit
and a push.

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

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `prepare` | — | Runs after `npm install`; installs the husky hooks. | automatic |

---

## See Also

- [`docs/engineering.md`](engineering.md) — the gates, the tests and CI.
- [`docs/architecture.md`](architecture.md) — how the script works.
- [LP Ranger's `docs/claude/CLAUDE-CI.md`](https://github.com/nottoseethesun/lp-ranger/blob/main/docs/claude/CLAUDE-CI.md)
  — the merge protocol these gates feed.
