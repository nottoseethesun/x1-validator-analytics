/**
 * @fileoverview
 * Fetches inflation rewards for a specified vote account on the X1 blockchain (Solana fork)
 * from the previous completed epoch back to epoch 0 (full history by default), assigns $XNT prices (fallback $1),
 * and generates two CSVs: main per-epoch rewards (with cumulative columns) + separate analytics summary.
 * Optional JSON export available.
 *
 * @usage
 * Full history (default): node fetch-total-validator-earnings.js --vote-pubkey YOUR_PUBKEY
 * Last 20 epochs: node fetch-total-validator-earnings.js --epochs 20 --vote-pubkey YOUR_PUBKEY
 * Verbose: node fetch-total-validator-earnings.js --verbose --vote-pubkey YOUR_PUBKEY
 * With JSON export: node fetch-total-validator-earnings.js --json --vote-pubkey YOUR_PUBKEY
 *
 * @commandLineOptions
 * --rpc-url              X1 RPC endpoint                       Default: from config.json
 * --vote-pubkey          Vote account public key               Required if not in config.json
 * --liquidity-pool-address  Liquidity pool address for price   Default: from config.json
 * --fallback-price-usd   Fallback price ($/XNT)                Default: from config.json
 * --output, -o           Main CSV file path                    Default: from config.json
 * --verbose, -v          Enable detailed verbose logging      (flag, default: false)
 * --epochs, -n           Number of epochs to process (from current-1 backwards)  (optional, default: null = unlimited/full)
 * --json                 Export full data as JSON file (xnt_rewards.json)  (flag, default: false)
 *
 * @notes
 * - Processes from current-1 back to epoch 0 by default (full history).
 * - Uses X1-specific getInflationReward (epoch as plain u64).
 * - Per-epoch error handling: skips failed queries without crashing.
 * - Main CSV includes "Cumulative XNT" and "Cumulative USD" running totals.
 * - Progress bar shown in quiet mode for long runs.
 * - Generates separate analytics CSV (xnt_rewards_analytics.csv).
 * - Optional JSON export (xnt_rewards.json) includes metadata, summary, and full rewards array.
 * - CSV files include UTF-8 BOM for correct opening in LibreOffice/Excel.
 * - Early epoch failures (<=15) are expected due to X1 rollback/reboot.
 * - Reward dates now use real block time from effectiveSlot + getBlockTime() when available.
 * - Requires Node.js ≥ 20 for stable ESM support.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import moment from 'moment';
import fs from 'fs';
import { stringify } from 'csv-stringify/sync';
import { loadConfig } from './configLoader.js';
import { writeMainCsv, writeAnalyticsCsv } from './csvWriter.js';
import { writeJsonExport } from './jsonWriter.js';

/**
 * Fetches historical $XNT price at given timestamp from the specified liquidity pool.
 * Currently returns fallback value due to lack of public historical price API.
 *
 * @param {number} timestamp - Unix timestamp (seconds)
 * @param {string} poolAddress - Liquidity pool address
 * @returns {Promise<number>} Price in USD (currently always fallback)
 */
async function fetchHistoricalPrice(timestamp, poolAddress) {
  console.log(
    `Price lookup for pool ${poolAddress} at ${moment.unix(timestamp).format('YYYY-MM-DD')}: ` +
    `using fallback $${loadConfig().fallbackPriceUsd} (no historical API available)`
  );
  return loadConfig().fallbackPriceUsd;
}

/**
 * Parses command-line arguments using yargs.
 *
 * @returns {Object} Parsed argv object.
 */
function parseArguments() {
  return yargs(hideBin(process.argv))
    .option('rpc-url', { type: 'string', default: loadConfig().rpcUrl })
    .option('vote-pubkey', { type: 'string', demandOption: true })
    .option('liquidity-pool-address', { type: 'string', default: loadConfig().liquidityPoolAddress })
    .option('fallback-price-usd', { type: 'number', default: loadConfig().fallbackPriceUsd })
    .option('output', { alias: 'o', type: 'string', default: loadConfig().outputFile })
    .option('verbose', { alias: 'v', type: 'boolean', default: loadConfig().verbose })
    .option('epochs', {
      alias: 'n',
      type: 'number',
      description: 'Number of epochs to process (from current-1 backwards)',
      default: loadConfig().epochs
    })
    .option('json', {
      type: 'boolean',
      description: 'Export full data as JSON file (xnt_rewards.json)',
      default: false
    })
    .argv;
}

/**
 * Creates and returns a Solana Connection object.
 *
 * @param {string} rpcUrl - The RPC endpoint URL.
 * @returns {Connection} Initialized Solana Connection.
 */
function createConnection(rpcUrl) {
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Retrieves and logs basic RPC health information if verbose mode is enabled.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {boolean} verbose - Whether to print detailed logs.
 * @returns {Promise<void>}
 */
async function logRpcHealth(connection, verbose) {
  if (!verbose) return;

  try {
    const epochInfo = await connection.getEpochInfo();
    console.log('RPC Health - Current Epoch:', epochInfo.epoch);
    console.log('Absolute Slot:', epochInfo.absoluteSlot);
    console.log('Epoch Start Slot:', epochInfo.epochStartSlot || 'undefined');
  } catch (e) {
    console.error('RPC health check failed:', e.message);
  }
}

/**
 * Retrieves the current vote account balance in XNT.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {PublicKey} votePubkey - Vote account public key.
 * @returns {Promise<number>} Balance in XNT.
 */
async function getVoteBalance(connection, votePubkey) {
  const balanceLamports = await connection.getBalance(votePubkey);
  const balanceXNT = balanceLamports / 1_000_000_000;
  console.log('Vote account balance:', balanceXNT.toFixed(6), 'XNT');
  return balanceXNT;
}

/**
 * Finds the vote account object from current and delinquent lists.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {PublicKey} votePubkey - Vote account public key.
 * @returns {Object} Vote account object.
 * @throws {Error} If vote account is not found.
 */
async function findVoteAccount(connection, votePubkey) {
  const voteAccounts = await connection.getVoteAccounts();
  const myVoteAccount = [...voteAccounts.current, ...voteAccounts.delinquent].find(
    acc => acc.votePubkey === votePubkey.toBase58()
  );

  if (!myVoteAccount) {
    throw new Error(`Vote account not found: ${votePubkey.toBase58()}`);
  }

  return myVoteAccount;
}

/**
 * Fetches the current epoch number from the chain.
 *
 * @param {Connection} connection - Solana connection instance.
 * @returns {Promise<number>} Current epoch number.
 */
async function getCurrentEpoch(connection) {
  const epochInfo = await connection.getEpochInfo();
  return epochInfo.epoch;
}

/**
 * Fetches reward data for a single epoch with accurate timestamp using effectiveSlot.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {PublicKey} votePubkey - Vote account public key.
 * @param {number} epoch - Epoch number to query.
 * @param {boolean} verbose - Whether to log raw response and errors.
 * @param {number} currentEpoch - Current epoch (for fallback time approximation).
 * @returns {Promise<Object|null>} Reward object if positive, null otherwise.
 */
async function fetchSingleEpochReward(connection, votePubkey, epoch, verbose, currentEpoch) {
  if (verbose) console.log(`Querying inflation reward for epoch ${epoch}...`);

  try {
    const inflationReward = await connection.getInflationReward([votePubkey], epoch);

    if (verbose) {
      console.log(`Raw response for epoch ${epoch}:`, JSON.stringify(inflationReward, null, 2));
    }

    const reward = inflationReward?.[0] ?? null;

    if (reward?.amount > 0) {
      const amountXNT = reward.amount / 1e9;

      let rewardTimestamp;

      // Try to get real block time from effectiveSlot
      if (reward.effectiveSlot !== undefined) {
        try {
          rewardTimestamp = await connection.getBlockTime(reward.effectiveSlot);
          if (verbose && rewardTimestamp) {
            console.log(`Using real block time for epoch ${epoch}: ${rewardTimestamp}`);
          }
        } catch (e) {
          if (verbose) console.warn(`getBlockTime failed for slot ${reward.effectiveSlot} in epoch ${epoch}: ${e.message}`);
        }
      }

      // Fallback to approximation if no slot or getBlockTime failed
      if (!rewardTimestamp) {
        rewardTimestamp = Math.floor(Date.now() / 1000) - ((currentEpoch - epoch) * 24 * 60 * 60);
        if (verbose) console.log(`Using fallback timestamp for epoch ${epoch}`);
      }

      const priceUSD = await fetchHistoricalPrice(rewardTimestamp, loadConfig().liquidityPoolAddress);
      const valueUSD = (amountXNT * priceUSD).toFixed(4);

      return {
        epoch,
        rewardDate: moment.unix(rewardTimestamp).utc().format('YYYY-MM-DD HH:mm:ss'),
        xntAmount: amountXNT.toFixed(6),
        priceUSD: priceUSD.toFixed(6),
        valueUSD
      };
    }

    return null;
  } catch (e) {
    if (verbose) console.warn(`Failed to query epoch ${epoch}: ${e.message}`);
    return null;
  }
}

/**
 * Displays a simple text progress bar in reversed colors (white background, black text) with green fill.
 *
 * @param {number} current - Current progress.
 * @param {number} total - Total to reach.
 */
function displayProgressBar(current, total) {
  const barLength = 30;
  const filled = Math.round((current / total) * barLength);
  const bar = '\x1b[42m' + '█'.repeat(filled) + '\x1b[0m' + '▒'.repeat(barLength - filled);
  const percent = ((current / total) * 100).toFixed(0);
  process.stdout.write(`\r\x1b[7m Progress: [${bar}] ${percent}% (${current}/${total} epochs) \x1b[0m`);
}

/**
 * Processes epochs and collects reward data with per-epoch error handling and progress bar.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {PublicKey} votePubkey - Vote account public key.
 * @param {number} currentEpoch - Current epoch number.
 * @param {boolean} verbose - Whether to log detailed information.
 * @param {number|null} maxEpochs - Max number of epochs to process (null = unlimited).
 * @returns {Promise<{rewards: Array, totalEpochsProcessed: number, failedEpochs: number, lowEpochFailures: number, unexpectedFailures: number, expectedEpochs: number}>}
 */
async function fetchRewardsForEpochs(connection, votePubkey, currentEpoch, verbose, maxEpochs = null) {
  const rewards = [];
  let processedCount = 0;
  let failedCount = 0;
  let lowEpochFailures = 0;
  let unexpectedFailures = 0;

  const estimatedTotal = maxEpochs !== null && maxEpochs !== undefined ? maxEpochs : currentEpoch;

  console.log(`Processing epochs from ${currentEpoch - 1} back to epoch 0...`);

  const barLength = 30;
  const updateInterval = 5;

  for (let epoch = currentEpoch - 1; epoch >= 0; epoch--) {
    const reward = await fetchSingleEpochReward(connection, votePubkey, epoch, verbose, currentEpoch);

    if (reward === null) {
      failedCount++;
      if (epoch <= 15) {
        lowEpochFailures++;
      } else {
        unexpectedFailures++;
      }
    } else {
      rewards.push(reward);
      console.log(`Found reward in epoch ${epoch}: ${reward.xntAmount} XNT`);
    }

    processedCount++;

    if (!verbose && processedCount % updateInterval === 0) {
      const percent = ((processedCount / estimatedTotal) * 100).toFixed(0);
      const filled = Math.round((processedCount / estimatedTotal) * barLength);
      const bar = '\x1b[42m' + '█'.repeat(filled) + '\x1b[0m' + '▒'.repeat(barLength - filled);
      process.stdout.write(`\r\x1b[7m Progress: [${bar}] ${percent}% (${processedCount}/${estimatedTotal} epochs) \x1b[0m`);
    }

    if (maxEpochs !== null && maxEpochs !== undefined && processedCount >= maxEpochs) {
      if (verbose) console.log(`Reached requested limit of ${maxEpochs} epochs. Stopping.`);
      break;
    }
  }

  if (!verbose) process.stdout.write('\r' + ' '.repeat(80) + '\r');

  if (failedCount > 0) {
    console.warn(`Warning: ${failedCount} epochs failed to query (skipped gracefully).`);
  }

  const expectedEpochs = processedCount - lowEpochFailures;

  return { rewards, totalEpochsProcessed: processedCount, failedEpochs: failedCount, lowEpochFailures, unexpectedFailures, expectedEpochs };
}

/**
 * Generates and prints the final summary statistics.
 *
 * @param {Array} rewards - Array of reward objects.
 * @param {number} totalEpochsProcessed - Total epochs queried.
 * @param {number} failedEpochs - Total failed queries.
 * @param {number} lowEpochFailures - Failed queries in early epochs (<=15).
 * @param {number} unexpectedFailures - Failed queries outside early range.
 * @param {number} expectedEpochs - Epochs expected to be queryable (processed - low failures).
 */
function printSummary(rewards, totalEpochsProcessed, failedEpochs, lowEpochFailures, unexpectedFailures, expectedEpochs) {
  if (rewards.length === 0) return;

  const firstDate = moment(rewards[0].rewardDate).startOf('day');
  const lastDate = moment(rewards[rewards.length - 1].rewardDate).startOf('day');
  const days = lastDate.diff(firstDate, 'days') + 1;
  const totalXNT = rewards.reduce((sum, r) => sum + parseFloat(r.xntAmount), 0);
  const avgDaily = days > 0 ? (totalXNT / days).toFixed(6) : 'N/A';
  const totalEpochsWithRewards = rewards.length;
  const percentageExpectedWithRewards = expectedEpochs > 0 ? ((totalEpochsWithRewards / expectedEpochs) * 100).toFixed(2) : '0.00';
  const avgPerEpoch = totalEpochsWithRewards > 0 ? (totalXNT / totalEpochsWithRewards).toFixed(6) : 'N/A';

  console.log('\nSummary:');
  console.log(`  Final date range (approx): ${firstDate.format('YYYY-MM-DD')} to ${lastDate.format('YYYY-MM-DD')}`);
  console.log(`  Days covered: ${days}`);
  console.log(`  Total XNT earned: ${totalXNT.toFixed(6)}`);
  console.log(`  Average $XNT earned per day: ${avgDaily}`);
  console.log(`  Total epochs processed: ${totalEpochsProcessed}`);
  console.log(`  Total epochs with rewards: ${totalEpochsWithRewards}`);
  console.log(`  Percentage of Expected Epochs with Rewards (accounts for early chain rollback): ${percentageExpectedWithRewards}%`);
  console.log(`  Average $XNT per epoch: ${avgPerEpoch}`);
  console.log(`  Unexpected failed epoch queries: ${unexpectedFailures} (outside expected early range)`);
  if (failedEpochs > 0) {
    console.log(`  Failed epoch queries (due to early X1 chain roll-back, see "Unexpected failed epoch queries"): ${failedEpochs}`);
  }
  if (lowEpochFailures > 0) {
    console.log(`  Note: ${lowEpochFailures} failures in early epochs (<=15) are expected due to the X1 Mainnet Buenos Aires Reboot/rollback — pre-reboot ledger data is not queryable on the current chain.`);
  }
}

/**
 * Main entry point: orchestrates the entire process.
 */
async function main() {
  const config = loadConfig();
  const argv = parseArguments();

  const connection = createConnection(argv['rpc-url']);
  const votePubkey = new PublicKey(argv['vote-pubkey']);

  await logRpcHealth(connection, argv.verbose);
  await getVoteBalance(connection, votePubkey);

  const myVoteAccount = await findVoteAccount(connection, votePubkey);
  const activationEpoch = myVoteAccount.epochCredits?.[0]?.[0] || 0;

  const currentEpoch = await getCurrentEpoch(connection);

  const { rewards, totalEpochsProcessed, failedEpochs, lowEpochFailures, unexpectedFailures, expectedEpochs } = await fetchRewardsForEpochs(
    connection,
    votePubkey,
    currentEpoch,
    argv.verbose,
    argv.epochs
  );

  if (rewards.length === 0) {
    console.log('No rewards found.');
    console.log('Tip: Check validator dashboard for credit history.');
    return;
  }

  // Sort oldest → newest
  rewards.sort((a, b) => moment(a.rewardDate).unix() - moment(b.rewardDate).unix());

  // Compute cumulatives ONCE and attach to each reward object
  let cumulativeXNT = 0;
  let cumulativeUSD = 0;
  rewards.forEach(r => {
    cumulativeXNT += parseFloat(r.xntAmount);
    cumulativeUSD += parseFloat(r.valueUSD);
    r.cumulativeXNT = cumulativeXNT.toFixed(6);
    r.cumulativeUSD = cumulativeUSD.toFixed(4);
  });

  printSummary(rewards, totalEpochsProcessed, failedEpochs, lowEpochFailures, unexpectedFailures, expectedEpochs);
  writeMainCsv(rewards, argv.output);
  writeAnalyticsCsv(rewards, totalEpochsProcessed, failedEpochs, lowEpochFailures, unexpectedFailures, expectedEpochs);

  // Optional JSON export
  writeJsonExport(rewards, totalEpochsProcessed, failedEpochs, lowEpochFailures, unexpectedFailures, expectedEpochs, currentEpoch, activationEpoch, argv.json);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
