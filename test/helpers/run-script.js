/**
 * Runs bin/end-user/fetch-total-validator-earnings.js, the real script, in a child
 * process against stand-ins, and reads what it wrote; and starts the two
 * stand-ins a run asks, a stand-in X1 endpoint and a stand-in GeckoTerminal
 * with the hourly candles a test describes (`startStandIns`, `hourOf`,
 * `flatCandles`).
 * @module test/helpers/run-script
 *
 * The script runs in a temp folder of its own, removed afterwards, so it
 * writes nothing into the repo, with the output/csv/ and output/json/
 * folders the repo's top keeps, unless a test names others, or a link to
 * another folder in place of one. The folder's
 * config.json points its price
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
import { ANALYTICS_CSV } from "../../reports/csvWriter.js";
import { ANALYTICS_JSON, FULL_JSON } from "../../reports/jsonWriter.js";
import { startStandInX1 } from "./stand-in-x1.js";
import {
  serveStandInGeckoTerminal,
  standInGeckoTerminal,
} from "./stand-in-gecko-terminal.js";

const execFileAsync = promisify(execFile);

/** The script under test. */
const SCRIPT = fileURLToPath(
  new URL(
    "../../bin/end-user/fetch-total-validator-earnings.js",
    import.meta.url,
  ),
);

/** The vote account the tests ask about: made up, a key no account on X1 is known to hold. */
export const VOTE_PUBKEY = "MadeUpVote111111111111111111111111111111111";

/** The reward each epoch pays, in lamports: 1.234567891 XNT, so an amount rounded to fewer than nine decimal places shows. */
export const REWARD_LAMPORTS = 1234567891;

/** An hour, in seconds. */
export const HOUR = 3600;

/** The stand-in chain's time, unless a test gives another: 12:00 UTC on 2026-11-10. */
export const NOW_SECONDS = Date.UTC(2026, 10, 10, 12, 0, 0) / 1000;

/**
 * The open time of the hourly candle that holds a time.
 *
 * @param {number} seconds - The time, in unix seconds
 * @returns {number} The hour's start, in unix seconds
 */
export function hourOf(seconds) {
  return Math.floor(seconds / HOUR) * HOUR;
}

/**
 * Hourly candles at one price, from one hour to another.
 *
 * @param {number} fromHour - The first candle's open time
 * @param {number} toHour - The last candle's open time
 * @param {number} price - Each candle's price
 * @returns {Array<Array<number>>} The candles, as [open time, price]
 */
export function flatCandles(fromHour, toHour, price) {
  const candles = [];
  for (let open = fromHour; open <= toHour; open += HOUR)
    candles.push([open, price]);
  return candles;
}

/**
 * Starts the two stand-ins: an X1 endpoint whose vote account is paid
 * `REWARD_LAMPORTS` each epoch, at `NOW_SECONDS` unless the chain's settings
 * give another time, and a GeckoTerminal.
 *
 * @param {Object} chainSettings - The stand-in chain's settings, beyond the vote account, reward and time
 * @param {function(Object): Object} marketFor - Makes the stand-in GeckoTerminal's market from the chain's settings
 * @returns {Promise<{x1: Object, gecko: Object, server: Object, close: function(): Promise<void>}>} The stand-ins
 */
export async function startStandIns(chainSettings, marketFor) {
  const x1 = await startStandInX1({
    votePubkey: VOTE_PUBKEY,
    rewardLamports: REWARD_LAMPORTS,
    nowSeconds: NOW_SECONDS,
    ...chainSettings,
  });
  const gecko = standInGeckoTerminal(marketFor(x1.chain));
  const server = await serveStandInGeckoTerminal(gecko);
  return {
    x1,
    gecko,
    server,
    close: async () => Promise.all([x1.close(), server.close()]),
  };
}

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
 * @param {string} [run.geckoTerminalUrl] - The stand-in GeckoTerminal's url, which the folder's config.json names
 * @param {string[]} [run.args=[]] - Arguments beyond --rpc-url, --vote-pubkey and --output
 * @param {Object} [run.config={}] - Settings for the folder's config.json beyond the stand-in GeckoTerminal's url
 * @param {string} [run.configText] - The folder's config.json, written as given in place of the settings, for a file that is not JSON
 * @param {number} [run.timeoutMs=0] - How long the run may take before it is stopped, in milliseconds; 0 for no limit
 * @param {string[]} [run.folders=["output/csv", "output/json"]] - The folders made in the folder it runs in, as the repo's top keeps them
 * @param {Object<string, string>} [run.links={}] - Links made in the folder it runs in, after its folders, each at its path, to the folder it names, which removing the folder it runs in leaves alone
 * @returns {Promise<{code: number, killed: boolean, stdout: string, stderr: string, rows: ?Array<Object>,
 *   analytics: ?Array<Object>, json: ?Object, analyticsJson: ?Array<Object>}>} How it ended, whether it was
 *   stopped for taking too long, and what it wrote
 */
export async function runScript({
  rpcUrl,
  geckoTerminalUrl,
  args = [],
  config = {},
  configText,
  timeoutMs = 0,
  folders = ["output/csv", "output/json"],
  links = {},
}) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "x1-validator-analytics-test-"),
  );
  try {
    for (const folder of folders)
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
    for (const [link, target] of Object.entries(links))
      fs.symlinkSync(target, path.join(dir, link));
    fs.writeFileSync(
      path.join(dir, "config.json"),
      configText ??
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
      analytics: readCsv(path.join(dir, ANALYTICS_CSV)),
      json: readJson(path.join(dir, FULL_JSON)),
      analyticsJson: readJson(path.join(dir, ANALYTICS_JSON)),
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
