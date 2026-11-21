/**
 * Runs fetch-total-validator-earnings.js, the real script, in a child
 * process against stand-ins, and reads what it wrote.
 * @module test/helpers/run-script
 *
 * The script runs in a temp folder of its own, removed afterwards, so it
 * writes nothing into the repo. The folder's config.json points its price
 * lookup at a stand-in GeckoTerminal, and --rpc-url points it at a stand-in
 * X1 endpoint, so the run asks nothing outside the computer.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

const execFileAsync = promisify(execFile);

/** The script under test. */
const SCRIPT = fileURLToPath(
  new URL("../../fetch-total-validator-earnings.js", import.meta.url),
);

/** The vote account the tests ask about. */
export const VOTE_PUBKEY = "Ce5RppixDArjtH588uXMCryNYcAtbNqaWncY4tBCdYUs";

/**
 * Reads a csv the script wrote, if it wrote it.
 *
 * @param {string} file - The file
 * @returns {Array<Object>|null} Its rows, by column name, or null when there is no such file
 */
function readCsv(file) {
  if (!fs.existsSync(file)) return null;
  return parse(fs.readFileSync(file, "utf8"), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  });
}

/**
 * Reads a json file the script wrote, if it wrote it.
 *
 * @param {string} file - The file
 * @returns {*} Its contents, or null when there is no such file
 */
function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/**
 * Runs the script once and reads its output files.
 *
 * @param {Object} run - The run
 * @param {string} run.rpcUrl - The stand-in X1 endpoint's url
 * @param {string} run.geckoTerminalUrl - The stand-in GeckoTerminal's url
 * @param {string[]} [run.args=[]] - Arguments beyond --rpc-url, --vote-pubkey and --output
 * @param {Object} [run.config={}] - Settings for the folder's config.json beyond the stand-in GeckoTerminal's url
 * @param {number} [run.timeoutMs=0] - How long the run may take before it is stopped, in milliseconds; 0 for no limit
 * @returns {Promise<{code: number, killed: boolean, stdout: string, stderr: string, rows: ?Array<Object>,
 *   analytics: ?Array<Object>, json: ?Object, analyticsJson: ?Array<Object>}>} How it ended, whether it was
 *   stopped for taking too long, and what it wrote
 */
export async function runScript({
  rpcUrl,
  geckoTerminalUrl,
  args = [],
  config = {},
  timeoutMs = 0,
}) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "x1-validator-analytics-test-"),
  );
  try {
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({ geckoTerminalApiUrl: geckoTerminalUrl, ...config }),
    );
    const output = path.join(dir, "rewards.csv");
    const argv = [
      SCRIPT,
      "--rpc-url",
      rpcUrl,
      "--vote-pubkey",
      VOTE_PUBKEY,
      "--output",
      output,
      ...args,
    ];
    let ended;
    try {
      ended = {
        code: 0,
        killed: false,
        ...(await execFileAsync(process.execPath, argv, {
          cwd: dir,
          timeout: timeoutMs,
        })),
      };
    } catch (error) {
      ended = {
        code: error.code ?? 1,
        killed: error.killed === true,
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? String(error),
      };
    }
    return {
      ...ended,
      rows: readCsv(output),
      analytics: readCsv(path.join(dir, "xnt_rewards_analytics.csv")),
      json: readJson(path.join(dir, "xnt_rewards.json")),
      analyticsJson: readJson(path.join(dir, "xnt_rewards_analytics.json")),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A metric's value in the analytics csv.
 *
 * @param {Array<Object>} analytics - The analytics csv's rows
 * @param {string} name - The metric's name
 * @returns {string|undefined} Its value
 */
export function metric(analytics, name) {
  return analytics.find((row) => row.Metric === name)?.Value;
}
