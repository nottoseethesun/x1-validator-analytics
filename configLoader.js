/**
 * @fileoverview
 * Loads configuration from config.json with fallback defaults.
 */

import fs from 'fs';

/**
 * Loads configuration from config.json with fallback defaults.
 *
 * @returns {Object} Configuration object with all defaults.
 */
export function loadConfig() {
  const defaults = {
    rpcUrl: 'https://rpc.mainnet.x1.xyz',
    votePubkey: 'YOUR_VOTE_ACCOUNT_PUBKEY_HERE',
    liquidityPoolAddress: 'CAJeVEoSm1QQZccnCqYu9cnNF7TTD2fcUA3E5HQoxRvR',
    fallbackPriceUsd: 1.0,
    outputFile: 'xnt_rewards_with_prices.csv',
    verbose: false,
    epochs: null
  };

  try {
    const fileContent = fs.readFileSync('./config.json', 'utf8');
    return { ...defaults, ...JSON.parse(fileContent) };
  } catch {
    console.warn('config.json not found or invalid → using defaults');
    return defaults;
  }
}
