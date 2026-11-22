/**
 * @fileoverview
 * The script's settings: `config.json`, in the folder the script runs in,
 * checked against its JSON Schema, over the defaults.
 *
 * What: each setting in `config.json` takes the place of the same default
 * here, so the file needs only the settings that differ, and a run in a
 * folder without one takes the defaults, with a notice. Before the script
 * takes a setting, crypto-price-fetchers' `readSettingsFile`
 * (`crypto-price-fetchers/lib/settings-file`) checks the file against
 * `SETTINGS_SCHEMA`, a JSON Schema built from crypto-price-fetchers' kinds
 * of value (`crypto-price-fetchers/lib/settings-schema`), as LP Ranger
 * checks its settings: a file that is not JSON, a setting the script does
 * not read, such as a misspelled one, or a value of the wrong kind stops
 * the run, with every problem listed, one line each.
 *
 * The XNT price comes from GeckoTerminal's hourly candles for the pool at
 * liquidityPoolAddress, which must pair XNT (wrapped, at xntTokenAddress)
 * with the USD stablecoin at usdStablecoinAddress; the defaults are XDEX's
 * WXNT / USDC.X pool and its two mints. requestTimeoutSeconds is how long a
 * request to the X1 endpoint may take to answer in full before it counts
 * as failed: a whole number of seconds up to 2147483, the longest time
 * limit Node's timers keep. epochs, null for every epoch, and the other settings the
 * command line names are the defaults of its options.
 */

import fs from "node:fs";
import { GECKO_TERMINAL_API_URL } from "crypto-price-fetchers/dex-prices/geckoterminal";
import { readSettingsFile } from "crypto-price-fetchers/lib/settings-file";
import { KINDS } from "crypto-price-fetchers/lib/settings-schema";
import { PUBLIC_KEY_FORMATS, PUBLIC_KEY } from "./public-key.js";

/** The settings file, in the folder the script runs in. */
const SETTINGS_FILE = "config.json";

/** The settings the script takes when `config.json` does not set them. */
export const DEFAULTS = Object.freeze({
  rpcUrl: "https://rpc.mainnet.x1.xyz",
  requestTimeoutSeconds: 30,
  liquidityPoolAddress: "CAJeVEoSm1QQZccnCqYu9cnNF7TTD2fcUA3E5HQoxRvR",
  geckoTerminalApiUrl: GECKO_TERMINAL_API_URL,
  geckoTerminalNetwork: "x1-network",
  xntTokenAddress: "So11111111111111111111111111111111111111112",
  usdStablecoinAddress: "B69chRzqzDCmdB5WYB8NRu5Yv5ZA95ABiZcdzCgGm9Tq",
  outputFile: "xnt_rewards_with_prices.csv",
  verbose: false,
  epochs: null,
});

/**
 * The JSON Schema of `config.json`: each setting the script reads, of its
 * kind, and `apiKeys`, the services whose keys the programs send, which
 * crypto-price-fetchers' key store reads; no other key.
 */
export const SETTINGS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    rpcUrl: KINDS.url,
    requestTimeoutSeconds: KINDS.timeLimitSeconds,
    liquidityPoolAddress: PUBLIC_KEY,
    geckoTerminalApiUrl: KINDS.url,
    geckoTerminalNetwork: KINDS.text,
    xntTokenAddress: PUBLIC_KEY,
    usdStablecoinAddress: PUBLIC_KEY,
    outputFile: KINDS.text,
    verbose: KINDS.bool,
    epochs: KINDS.wholeAbove0OrNone,
    apiKeys: {
      type: "array",
      uniqueItems: true,
      items: KINDS.text,
      description:
        "a list of the services whose keys the programs send, each once",
    },
  },
});

/**
 * Reads the settings: `config.json`, checked against `SETTINGS_SCHEMA`,
 * over the defaults.
 *
 * @param {string} [file='config.json'] - The settings file, which a test names
 * @param {function(string): void} [warn] - Prints the notice that there is no settings file: the console's warning, unless a test reads it
 * @returns {Object} The settings
 * @throws {Error} When the file cannot be read, is not JSON, or has a problem the schema finds, every problem listed
 */
export function loadConfig(
  file = SETTINGS_FILE,
  warn = (notice) => console.warn(notice),
) {
  if (!fs.existsSync(file)) {
    warn(`No ${file} in this folder: the run takes the defaults.`);
  }
  const own = readSettingsFile(file, {
    schema: SETTINGS_SCHEMA,
    formats: PUBLIC_KEY_FORMATS,
    name: SETTINGS_FILE,
  });
  return { ...DEFAULTS, ...own };
}
