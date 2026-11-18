# x1-validator-analytics — Engineering Reference

The files the script reads and writes, the gates every change passes, the
tests, and CI. For how the script works, see
[`docs/architecture.md`](architecture.md); for every npm command, see
[`docs/npm-project-commands.md`](npm-project-commands.md).

The repo follows LP Ranger's coding standards: its `CLAUDE.md` and
`docs/claude/`, in
[nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Files on Disk](#files-on-disk)
- [The Gate: `npm run check`](#the-gate-npm-run-check)
- [Lint](#lint)
- [Tests](#tests)
- [Security Audits](#security-audits)
- [Dead Code Detection](#dead-code-detection)
- [CI and Branch Protection](#ci-and-branch-protection)
- [Known Bugs](#known-bugs)

---

## Quick Start

Node 22 or later. From the repo's top folder:

```bash
npm ci
npm run check
```

`npm ci` installs crypto-price-fetchers too, from GitHub, at the commit
`package.json` pins: no other step installs it.

---

## Files on Disk

| File | In git | What it holds |
| ---- | ------ | ------------- |
| `config.json` | yes | The script's settings, over the defaults in `configLoader.js`, and the services whose keys the programs send, under `apiKeys`: none today. |
| `api-keys.json` | no | Api keys, encrypted with the owner's password, should a service that takes one be added. |
| `xnt_rewards_with_prices.csv`, `xnt_rewards_analytics.csv` | no | The reports, unless `--output` names another file. |
| `xnt_rewards.json`, `xnt_rewards_analytics.json` | no | The reports as JSON, with `--json`. |
| `coverage/` | no | A test run's coverage report. |

---

## The Gate: `npm run check`

`npm run check` runs every gate, in order, and stops at the first that
fails: the lint, the tests with coverage, then the three security audits.
It must pass before every commit and push, and CI runs it on Node 22 and
Node 24.

---

## Lint

`npm run lint` runs:

| Tool | Configured in | What it holds the repo to |
| ---- | ------------- | ------------------------- |
| ESLint | `eslint.config.js` | LP Ranger's rules, with no warning allowed: cyclomatic complexity ≤ 17, ≤ 500 lines of code a file (blank lines and comments not counted), lines ≤ 80 characters but strings, urls and comments, `===`, no unused name, no `var`, `const` where nothing is reassigned, no `Math.random`, no comment that tells Prettier to skip code, and every import resolved. |
| markdownlint | `.markdownlint-cli2.jsonc` | LP Ranger's settings, over every Markdown file. |
| Prettier | `.prettierrc`, `.prettierignore` | Its formatting, in check mode, over every JavaScript, JSON and YAML file. |
| actionlint | — | The GitHub workflows. |
| knip | `knip.json` | No file nothing reaches. See [Dead Code Detection](#dead-code-detection). |

The husky pre-commit hook (`.husky/pre-commit`) runs `npm run lint`, which
`prepare` installs; `npm run format` or `npm run lint:fix` fixes
formatting. No rule is ever switched off in a file, no file is left out of
the lint, and a file over 500 lines is split, not excused.

---

## Tests

The tests are in `test/`, on Node's test runner, and ask nothing outside
the computer: the script runs against a stand-in X1 endpoint and a stand-in
GeckoTerminal, served locally, in a temp folder of its own.
[`test/README.md`](../test/README.md) lists the tests and the helpers.
`npm run test:coverage` fails below 80% of lines covered. Code written to
check something goes into the tests, so it is kept and run again rather
than written again.

---

## Security Audits

| Command | What it runs | What it catches |
| ------- | ------------ | --------------- |
| `npm run audit:deps` | `npm audit --audit-level=high --omit=dev` | Known vulnerabilities, of high severity or worse, in the packages that ship. |
| `npm run audit:security` | ESLint with `eslint-security.config.js` | Code open to attack (eslint-plugin-security), strings that look like keys (eslint-plugin-no-secrets), and printing a name that may hold a secret (`no-secret-logging`, from crypto-price-fetchers). |
| `npm run audit:secrets` | secretlint, with `.secretlintrc.json` and `.secretlintignore` | Keys and credentials in any file. |

The security lint follows LP Ranger's: no warning allowed, with
`detect-non-literal-fs-filename` and `detect-object-injection` off.
no-secrets passes the public X1 addresses the code names, listed in the
config as `PUBLIC_ADDRESSES`, which are base58 and look random to it.

The dependency audit's threshold is LP Ranger's, `high`.

---

## Dead Code Detection

`npm run knip:files` fails on any file nothing reaches, as in LP Ranger.
`knip.json` names the security config and the tests as entry points; the
script is `package.json`'s. Unused exports are not gated.

---

## CI and Branch Protection

Two workflows run on every push to `main`, every pull request to `main`, and
by hand:

| Workflow | Job | Runs |
| -------- | --- | ---- |
| `ci.yml` | Check (Node 22), Check (Node 24) | `npm run check`. |
| `security-audit.yml` | Dependency Audit, Security Lint, Secret Scan | Each audit as a job of its own. |

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
