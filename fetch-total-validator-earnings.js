/**
 * @fileoverview
 * Fetches inflation rewards for a specified vote account on the X1 blockchain (Solana fork)
 * from the previous completed epoch back to epoch 0 (full history by default), prices each
 * reward in USD at its own time, and generates two CSVs: main per-epoch rewards (with
 * cumulative columns) + separate analytics summary. Optional JSON export available.
 *
 * @usage
 * `node fetch-total-validator-earnings.js --help` lists every option, with
 * examples of its common uses and its exit codes; the command line is
 * declared with commander, the package that parses command lines, in
 * `parseArguments` below.
 *
 * @notes
 * - Processes from current-1 back to epoch 0 by default (full history).
 * - Uses X1-specific getInflationReward (epoch as plain u64).
 * - Per-epoch error handling: skips failed queries without crashing.
 * - Amounts are exact: XNT has nine decimal places, and every amount and XNT total keeps all nine.
 * - Each reward's price is XNT's in the USD stablecoin of the pool at liquidityPoolAddress, from
 *   GeckoTerminal's hourly candles: the close of the last candle that opened at or before the
 *   reward, less than a day before it (see xnt-price.js). GeckoTerminal's X1 candles start on
 *   2026-10-01, and its public api serves the last 180 days, so a reward before either has empty
 *   price and value cells, with a warning; it never gets a stand-in price, and the USD totals
 *   leave it out.
 * - Main CSV includes "Cumulative XNT" and "Cumulative USD" running totals.
 * - Progress bar shown in quiet mode for long runs.
 * - Generates separate analytics CSV (xnt_rewards_analytics.csv).
 * - Optional JSON export (xnt_rewards.json) includes metadata, summary, and full rewards array.
 * - CSV files include UTF-8 BOM for correct opening in LibreOffice/Excel.
 * - Early epoch failures (<=15) are expected due to X1 rollback/reboot.
 * - Reward dates now use real block time from effectiveSlot + getBlockTime() when available.
 * - Settings come from config.json in the folder the script runs in (see configLoader.js).
 * - Requires Node 24 or later, as the repo's package.json says.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { Command, InvalidArgumentError } from "commander";
import moment from "moment";
import { loadConfig } from "./configLoader.js";
import { writeMainCsv, writeAnalyticsCsv } from "./csvWriter.js";
import { writeJsonExport } from "./jsonWriter.js";
import { formatXnt } from "./xnt-amount.js";
import { geckoTerminalSource, priceTimes } from "./xnt-price.js";
import { rewardRows } from "./rewards.js";
import { summarizeRewards } from "./summary.js";

/**
 * Prices each reward at its own time, from GeckoTerminal's hourly candles.
 * A reward with no price is warned about, never given a stand-in price;
 * when GeckoTerminal cannot give the candles, no reward has a price.
 *
 * @param {Array<{timestamp: number}>} rewards - The rewards, with their block times in unix seconds
 * @param {Object} source - Where and how GeckoTerminal is asked (`geckoTerminalSource`)
 * @returns {Promise<Array<number|null>>} Each reward's price in USD per XNT, or null where it has none
 */
async function lookUpPrices(rewards, source) {
  let found;
  try {
    found = await priceTimes(
      rewards.map((reward) => reward.timestamp),
      source,
    );
  } catch (e) {
    console.warn(
      `Warning: no XNT prices, since GeckoTerminal could not give them (${e.message}). ` +
        "Every price and value cell is empty, and the USD totals are 0.",
    );
    return rewards.map(() => null);
  }
  const unpriced = found.prices.filter((price) => price === null).length;
  if (unpriced > 0) {
    const earliest =
      found.earliestCandleSeconds === null
        ? "none"
        : moment
            .unix(found.earliestCandleSeconds)
            .utc()
            .format("YYYY-MM-DD HH:mm");
    console.warn(
      `Warning: ${unpriced} of ${rewards.length} rewards have no XNT price, since GeckoTerminal gave no ` +
        `hourly candle for pool ${source.pool} in the day before them (its earliest given: ${earliest} UTC; ` +
        "its public api serves the last 180 days). Their price and value cells are empty, and the USD " +
        "totals leave them out.",
    );
  }
  return found.prices;
}

/** What the help says after the options: where the defaults come from, examples, exit codes. */
const HELP_AFTER = `
The defaults of --rpc-url, --liquidity-pool-address, --output, --verbose
and --epochs come from config.json in the folder the script runs in.

Examples:
  Every reward of a vote account, from its first epoch to the last one
  completed, written to the CSV file config.json names:
    $ node fetch-total-validator-earnings.js --vote-pubkey <vote-account>
  The last 20 epochs only, with each step logged:
    $ node fetch-total-validator-earnings.js --vote-pubkey <vote-account> --epochs 20 --verbose
  Every reward, with a JSON file of all of it beside the CSV files:
    $ node fetch-total-validator-earnings.js --vote-pubkey <vote-account> --json
  The same first run, through npm:
    $ npm start -- --vote-pubkey <vote-account>

Exit codes:
  0  the CSV files were written, or the account had no rewards
  1  an option was wrong or missing, or a request to the chain failed`;

/**
 * Checks that an option is a whole number above 0.
 *
 * @param {string} value - The option's text
 * @returns {number} The number
 * @throws {InvalidArgumentError} When it is not a whole number above 0
 */
function positiveWholeNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new InvalidArgumentError("It is not a whole number above 0.");
  }
  return number;
}

/**
 * Reads the command line, declared with commander.
 *
 * @param {Object} config - The settings (`loadConfig`), which give the defaults.
 * @param {string[]} [argv=process.argv] - The arguments, as `process.argv` holds them
 * @returns {{votePubkey: string, rpcUrl: string, liquidityPoolAddress: string, output: string, verbose: boolean, epochs: (number|null), json: boolean}} The options
 */
function parseArguments(config, argv = process.argv) {
  return new Command()
    .name("fetch-total-validator-earnings")
    .description(
      "Reads every inflation reward an X1 vote account received, prices each in USD at its own time, " +
        "and writes them to a CSV file with running totals, and a summary beside it.",
    )
    .requiredOption("--vote-pubkey <pubkey>", "the vote account's public key")
    .option("--rpc-url <url>", "the X1 rpc endpoint to ask", config.rpcUrl)
    .option(
      "--liquidity-pool-address <address>",
      "the pool whose hourly candles on GeckoTerminal price XNT",
      config.liquidityPoolAddress,
    )
    .option(
      "-o, --output <file>",
      "the main CSV file to write",
      config.outputFile,
    )
    .option("-v, --verbose", "log each step", config.verbose)
    .option(
      "-n, --epochs <count>",
      "how many epochs to read, back from the last one completed; every epoch when unset",
      positiveWholeNumber,
      config.epochs,
    )
    .option(
      "--json",
      "also write all of it as a JSON file, xnt_rewards.json",
      false,
    )
    .addHelpText("after", HELP_AFTER)
    .parse(argv)
    .opts();
}

/**
 * Creates and returns a Solana Connection object.
 *
 * @param {string} rpcUrl - The RPC endpoint URL.
 * @returns {Connection} Initialized Solana Connection.
 */
function createConnection(rpcUrl) {
  return new Connection(rpcUrl, "confirmed");
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
    console.log(`RPC Health - Current Epoch: ${epochInfo.epoch}`);
    console.log(`Absolute Slot: ${epochInfo.absoluteSlot}`);
    console.log(
      `Epoch Start Slot: ${epochInfo.absoluteSlot - epochInfo.slotIndex}`,
    );
  } catch (e) {
    console.error("RPC health check failed:", e.message);
  }
}

/**
 * Retrieves the current vote account balance and logs it in XNT.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {PublicKey} votePubkey - Vote account public key.
 * @returns {Promise<bigint>} Balance in lamports.
 */
async function getVoteBalance(connection, votePubkey) {
  const balanceLamports = BigInt(await connection.getBalance(votePubkey));
  console.log("Vote account balance:", formatXnt(balanceLamports), "XNT");
  return balanceLamports;
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
  const myVoteAccount = [
    ...voteAccounts.current,
    ...voteAccounts.delinquent,
  ].find((acc) => acc.votePubkey === votePubkey.toBase58());

  if (!myVoteAccount) {
    throw new Error(`Vote account not found: ${votePubkey.toBase58()}`);
  }

  return myVoteAccount;
}

/**
 * Fetches the current epoch number from the chain. web3.js gives it as a
 * BigInt; an epoch number is small, so it is counted as a number here.
 *
 * @param {Connection} connection - Solana connection instance.
 * @returns {Promise<number>} Current epoch number.
 */
async function getCurrentEpoch(connection) {
  const epochInfo = await connection.getEpochInfo();
  return Number(epochInfo.epoch);
}

/**
 * Fetches reward data for a single epoch with accurate timestamp using effectiveSlot.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {PublicKey} votePubkey - Vote account public key.
 * @param {number} epoch - Epoch number to query.
 * @param {boolean} verbose - Whether to log raw response and errors.
 * @param {number} currentEpoch - Current epoch (for fallback time approximation).
 * @returns {Promise<{epoch: number, timestamp: number, lamports: bigint}|null>} The reward, with its time in
 *   unix seconds and its amount in lamports, if positive; null otherwise.
 */
async function fetchSingleEpochReward(
  connection,
  votePubkey,
  epoch,
  verbose,
  currentEpoch,
) {
  if (verbose) console.log(`Querying inflation reward for epoch ${epoch}...`);

  try {
    const inflationReward = await connection.getInflationReward(
      [votePubkey],
      epoch,
    );

    if (verbose) {
      // web3.js gives the amounts and slots as BigInts, which JSON writes
      // only as strings
      console.log(
        `Raw response for epoch ${epoch}:`,
        JSON.stringify(
          inflationReward,
          (_key, value) => (typeof value === "bigint" ? `${value}` : value),
          2,
        ),
      );
    }

    const reward = inflationReward?.[0] ?? null;

    if (reward?.amount > 0) {
      let rewardTimestamp;

      // Try to get real block time from effectiveSlot. web3.js gives a block
      // time as a BigInt of unix seconds, or null when it has none.
      if (reward.effectiveSlot !== undefined) {
        try {
          const blockTime = await connection.getBlockTime(reward.effectiveSlot);
          rewardTimestamp = blockTime === null ? null : Number(blockTime);
          if (verbose && rewardTimestamp) {
            console.log(
              `Using real block time for epoch ${epoch}: ${rewardTimestamp}`,
            );
          }
        } catch (e) {
          if (verbose)
            console.warn(
              `getBlockTime failed for slot ${reward.effectiveSlot} in epoch ${epoch}: ${e.message}`,
            );
        }
      }

      // Fallback to approximation if no slot or getBlockTime failed
      if (!rewardTimestamp) {
        rewardTimestamp =
          Math.floor(Date.now() / 1000) - (currentEpoch - epoch) * 24 * 60 * 60;
        if (verbose) console.log(`Using fallback timestamp for epoch ${epoch}`);
      }

      return {
        epoch,
        timestamp: rewardTimestamp,
        lamports: BigInt(reward.amount),
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
  const bar =
    "\x1b[42m" +
    "█".repeat(filled) +
    "\x1b[0m" +
    "▒".repeat(barLength - filled);
  const percent = ((current / total) * 100).toFixed(0);
  process.stdout.write(
    `\r\x1b[7m Progress: [${bar}] ${percent}% (${current}/${total} epochs) \x1b[0m`,
  );
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
async function fetchRewardsForEpochs(
  connection,
  votePubkey,
  currentEpoch,
  verbose,
  maxEpochs = null,
) {
  const rewards = [];
  let processedCount = 0;
  let failedCount = 0;
  let lowEpochFailures = 0;
  let unexpectedFailures = 0;

  const estimatedTotal =
    maxEpochs !== null && maxEpochs !== undefined ? maxEpochs : currentEpoch;

  console.log(`Processing epochs from ${currentEpoch - 1} back to epoch 0...`);

  const updateInterval = 5;

  for (let epoch = currentEpoch - 1; epoch >= 0; epoch--) {
    const reward = await fetchSingleEpochReward(
      connection,
      votePubkey,
      epoch,
      verbose,
      currentEpoch,
    );

    if (reward === null) {
      failedCount++;
      if (epoch <= 15) {
        lowEpochFailures++;
      } else {
        unexpectedFailures++;
      }
    } else {
      rewards.push(reward);
      console.log(
        `Found reward in epoch ${epoch}: ${formatXnt(reward.lamports)} XNT`,
      );
    }

    processedCount++;

    if (!verbose && processedCount % updateInterval === 0) {
      displayProgressBar(processedCount, estimatedTotal);
    }

    if (
      maxEpochs !== null &&
      maxEpochs !== undefined &&
      processedCount >= maxEpochs
    ) {
      if (verbose)
        console.log(
          `Reached requested limit of ${maxEpochs} epochs. Stopping.`,
        );
      break;
    }
  }

  if (!verbose) process.stdout.write("\r" + " ".repeat(80) + "\r");

  if (failedCount > 0) {
    console.warn(
      `Warning: ${failedCount} epochs failed to query (skipped gracefully).`,
    );
  }

  const expectedEpochs = processedCount - lowEpochFailures;

  return {
    rewards,
    totalEpochsProcessed: processedCount,
    failedEpochs: failedCount,
    lowEpochFailures,
    unexpectedFailures,
    expectedEpochs,
  };
}

/**
 * Prints the final summary statistics.
 *
 * @param {Object} summary - The run's summary (`summarizeRewards` in summary.js).
 */
function printSummary(summary) {
  console.log("\nSummary:");
  console.log(`  Final date range (approx): ${summary.dateRange}`);
  console.log(`  Days covered: ${summary.days}`);
  console.log(`  Total XNT earned: ${summary.totalXnt}`);
  console.log(`  Average $XNT earned per day: ${summary.averageDailyXnt}`);
  console.log(`  Total epochs processed: ${summary.totalEpochsProcessed}`);
  console.log(`  Total epochs with rewards: ${summary.epochsWithRewards}`);
  console.log(`  Rewards without an XNT price: ${summary.rewardsWithoutPrice}`);
  console.log(
    `  Percentage of Expected Epochs with Rewards (accounts for early chain rollback): ${summary.percentageExpectedWithRewards}%`,
  );
  console.log(`  Average $XNT per epoch: ${summary.averagePerEpochXnt}`);
  console.log(
    `  Unexpected failed epoch queries: ${summary.unexpectedFailures} (outside expected early range)`,
  );
  if (summary.failedEpochs > 0) {
    console.log(
      `  Failed epoch queries (due to early X1 chain roll-back, see "Unexpected failed epoch queries"): ${summary.failedEpochs}`,
    );
  }
  if (summary.lowEpochFailures > 0) {
    console.log(
      `  Note: ${summary.lowEpochFailures} failures in early epochs (<=15) are expected due to the X1 Mainnet Buenos Aires Reboot/rollback — pre-reboot ledger data is not queryable on the current chain.`,
    );
  }
}

/**
 * Main entry point: orchestrates the entire process.
 */
async function main() {
  const config = loadConfig();
  const argv = parseArguments(config);

  const connection = createConnection(argv.rpcUrl);
  const votePubkey = new PublicKey(argv.votePubkey);

  await logRpcHealth(connection, argv.verbose);
  await getVoteBalance(connection, votePubkey);

  const myVoteAccount = await findVoteAccount(connection, votePubkey);
  // The first epoch the account earned credits in, a BigInt from web3.js
  const firstCreditEpoch = myVoteAccount.epochCredits?.[0]?.[0];
  const activationEpoch =
    firstCreditEpoch === undefined ? 0 : Number(firstCreditEpoch);

  const currentEpoch = await getCurrentEpoch(connection);

  const { rewards, ...counts } = await fetchRewardsForEpochs(
    connection,
    votePubkey,
    currentEpoch,
    argv.verbose,
    argv.epochs,
  );

  if (rewards.length === 0) {
    console.log("No rewards found.");
    console.log("Tip: Check validator dashboard for credit history.");
    return;
  }

  // Sort oldest → newest
  rewards.sort((a, b) => a.timestamp - b.timestamp);

  const prices = await lookUpPrices(
    rewards,
    geckoTerminalSource({
      apiUrl: config.geckoTerminalApiUrl,
      network: config.geckoTerminalNetwork,
      pool: argv.liquidityPoolAddress,
      xntToken: config.xntTokenAddress,
      usdToken: config.usdStablecoinAddress,
    }),
  );

  // Amounts, prices, values and running totals, worked out once
  const rows = rewardRows(rewards, prices);
  const summary = summarizeRewards(rows, counts);

  printSummary(summary);
  writeMainCsv(rows, argv.output);
  writeAnalyticsCsv(summary);

  // Optional JSON export
  writeJsonExport(rows, summary, { currentEpoch, activationEpoch }, argv.json);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
