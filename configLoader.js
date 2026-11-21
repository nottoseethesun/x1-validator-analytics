/**
 * @fileoverview
 * Loads configuration from config.json with fallback defaults.
 */

import fs from "fs";
import { GECKO_TERMINAL_API_URL } from "crypto-price-fetchers/dex-prices/geckoterminal";

/**
 * Loads configuration from config.json with fallback defaults.
 *
 * The XNT price comes from GeckoTerminal's hourly candles for the pool at
 * liquidityPoolAddress, which must pair XNT (wrapped, at xntTokenAddress)
 * with the USD stablecoin at usdStablecoinAddress; the defaults are XDEX's
 * WXNT / USDC.X pool and its two mints. requestTimeoutSeconds is how long a
 * request to the X1 endpoint may go without an answer before it counts as
 * failed.
 *
 * @returns {Object} Configuration object with all defaults.
 */
export function loadConfig() {
  const defaults = {
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
  };

  try {
    const fileContent = fs.readFileSync("./config.json", "utf8");
    return { ...defaults, ...JSON.parse(fileContent) };
  } catch {
    console.warn("config.json not found or invalid → using defaults");
    return defaults;
  }
}
