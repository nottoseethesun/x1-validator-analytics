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
 * - Per-epoch error handling: a failed query is skipped and counted, apart from an epoch the endpoint
 *   answers with no reward for the account, as it does for an epoch before the account began.
 * - Each request to the X1 endpoint gets its whole answer within requestTimeoutSeconds of
 *   config.json, 30 unless set, or counts as failed.
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
 * - A failed query in epochs 0 to 15 is expected: X1's chain was rolled back early in its life, and its
 *   endpoint cannot give the rewards of some of those epochs, epoch 15 among them.
 * - A reward's date is the block time of its effective slot, from getBlockTime(). A failed request for it is
 *   asked again twice, 2 seconds apart; when the chain still gives none, the run stops, naming the epoch.
 * - Settings come from config.json in the folder the script runs in (see configLoader.js).
 * - Requires Node 24 or later, as the repo's package.json says.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";
import {
  asWholeNumber,
  KINDS,
  kindParser,
} from "crypto-price-fetchers/lib/settings-schema";
import { fetchWithinTimeLimit } from "crypto-price-fetchers/lib/time-limited-fetch";
import moment from "moment";
import { DEFAULTS, loadConfig } from "./configLoader.js";
import { PUBLIC_KEY, PUBLIC_KEY_FORMATS } from "./public-key.js";
import { writeMainCsv, writeAnalyticsCsv } from "./csvWriter.js";
import { writeJsonExport } from "./jsonWriter.js";
import { formatXnt } from "./xnt-amount.js";
import { geckoTerminalSource, priceTimes } from "./xnt-price.js";
import { rewardRows } from "./rewards.js";
import { countEpochs, summarizeRewards } from "./summary.js";

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
and --epochs come from config.json in the folder the script runs in. When
config.json is refused, --help shows the defaults written in the script
(configLoader.js), and any other run stops: on a mistake in its options
when it has one, else on the file's problems.

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
  1  an option was wrong or missing, config.json was refused, a request to
     the chain failed, or the chain gave no block time for a reward`;

/**
 * The parsers of the options that take a value, made from the kinds of
 * value `config.json`'s schema gives the same settings (`configLoader.js`),
 * with crypto-price-fetchers' `kindParser`, so a typed value and the same
 * value in the file meet one rule. A refusal names the option.
 */
const PARSE = Object.freeze({
  publicKey: kindParser(PUBLIC_KEY, (text) => text, PUBLIC_KEY_FORMATS),
  url: kindParser(KINDS.url),
  epochs: kindParser(KINDS.wholeAbove0, asWholeNumber),
  output: kindParser(KINDS.text),
});

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
    .requiredOption(
      "--vote-pubkey <pubkey>",
      "the vote account's public key",
      PARSE.publicKey,
    )
    .option(
      "--rpc-url <url>",
      "the X1 rpc endpoint to ask",
      PARSE.url,
      config.rpcUrl,
    )
    .option(
      "--liquidity-pool-address <address>",
      "the pool whose hourly candles on GeckoTerminal price XNT",
      PARSE.publicKey,
      config.liquidityPoolAddress,
    )
    .option(
      "-o, --output <file>",
      "the main CSV file to write",
      PARSE.output,
      config.outputFile,
    )
    .option("-v, --verbose", "log each step", config.verbose)
    .option(
      "-n, --epochs <count>",
      "how many epochs to read, back from the last one completed; every epoch when unset",
      PARSE.epochs,
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
 * A fetch that gives up on a request whose answer has not arrived in full
 * within the time limit, for web3.js, which sends its requests with no
 * limit of its own: crypto-price-fetchers' `fetchWithinTimeLimit`, which
 * names the endpoint when the time runs out.
 *
 * @param {number} limitSeconds - How long a request may take, in seconds: config.json's requestTimeoutSeconds, a number above 0, as its schema holds it
 * @returns {function(string, Object=): Promise<Response>} The fetch
 */
function fetchWithTimeLimit(limitSeconds) {
  return (url, options) =>
    fetchWithinTimeLimit(url, options, {
      timeoutMs: limitSeconds * 1000,
      name: `The X1 endpoint at ${url}`,
    });
}

/**
 * Creates and returns a Solana Connection object, whose requests each get
 * their whole answer within the time limit or fail.
 *
 * @param {string} rpcUrl - The RPC endpoint URL.
 * @param {number} requestTimeoutSeconds - How long a request may take, in seconds.
 * @returns {Connection} Initialized Solana Connection.
 */
function createConnection(rpcUrl, requestTimeoutSeconds) {
  return new Connection(rpcUrl, {
    commitment: "confirmed",
    fetch: fetchWithTimeLimit(requestTimeoutSeconds),
  });
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
 * Finds the vote account among the chain's current and delinquent ones, so
 * that a key that names none stops the run before it reads any epoch.
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

/** How many more times a failed getBlockTime is asked. */
const BLOCK_TIME_RETRIES = 2;

/** The wait before each new ask of a failed getBlockTime, in milliseconds. */
const BLOCK_TIME_RETRY_WAIT_MS = 2000;

/**
 * The time of a reward's block, in unix seconds, from the chain. A failed
 * request is asked again up to BLOCK_TIME_RETRIES times,
 * BLOCK_TIME_RETRY_WAIT_MS apart, so one passing error does not end a long
 * run. web3.js gives a block time as a BigInt of unix seconds, or null when
 * it has none.
 *
 * @param {Connection} connection - The X1 connection
 * @param {Object} reward - The reward, as getInflationReward gives it
 * @param {number} epoch - The reward's epoch, for the messages
 * @param {boolean} verbose - Whether to log each step
 * @returns {Promise<number>} The block's time, in unix seconds
 * @throws {Error} When the reward names no slot, the chain gives no block time for it, or every request fails, naming the epoch, and the slot when there is one
 */
async function rewardBlockSeconds(connection, reward, epoch, verbose) {
  const slot = reward.effectiveSlot;
  if (slot === undefined || slot === null) {
    throw new Error(
      `The chain names no slot for the reward of epoch ${epoch}, so its time is unknown`,
    );
  }
  for (let attempt = 0; ; attempt++) {
    let blockTime;
    try {
      blockTime = await connection.getBlockTime(slot);
    } catch (e) {
      if (attempt >= BLOCK_TIME_RETRIES) {
        throw new Error(
          `getBlockTime failed ${attempt + 1} times for slot ${slot}, the reward of epoch ${epoch}: ${e.message}`,
          { cause: e },
        );
      }
      if (verbose)
        console.warn(
          `getBlockTime failed for slot ${slot} in epoch ${epoch}: ${e.message}; asking again`,
        );
      await new Promise((resolve) =>
        setTimeout(resolve, BLOCK_TIME_RETRY_WAIT_MS),
      );
      continue;
    }
    if (blockTime === null) {
      throw new Error(
        `The chain gives no block time for slot ${slot}, the reward of epoch ${epoch}`,
      );
    }
    if (verbose)
      console.log(`Using real block time for epoch ${epoch}: ${blockTime}`);
    return Number(blockTime);
  }
}

/**
 * Fetches reward data for a single epoch with accurate timestamp using effectiveSlot.
 *
 * @param {Connection} connection - Solana connection instance.
 * @param {PublicKey} votePubkey - Vote account public key.
 * @param {number} epoch - Epoch number to query.
 * @param {boolean} verbose - Whether to log raw response and errors.
 * @returns {Promise<{outcome: "reward", reward: {epoch: number, timestamp: number, lamports: bigint}}|{outcome: "none"}|{outcome: "failed"}>}
 *   The reward, with its time in unix seconds and its amount in lamports; or `none` when the endpoint
 *   answered with no reward for the account, or a reward of 0; or `failed` when the query failed.
 * @throws {Error} When the reward's block time cannot be had (`rewardBlockSeconds`)
 */
async function fetchSingleEpochReward(connection, votePubkey, epoch, verbose) {
  if (verbose) console.log(`Querying inflation reward for epoch ${epoch}...`);

  let inflationReward;
  try {
    inflationReward = await connection.getInflationReward([votePubkey], epoch);
  } catch (e) {
    if (verbose) console.warn(`Failed to query epoch ${epoch}: ${e.message}`);
    return { outcome: "failed" };
  }

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
  if (reward === null || !(reward.amount > 0)) return { outcome: "none" };

  const rewardTimestamp = await rewardBlockSeconds(
    connection,
    reward,
    epoch,
    verbose,
  );

  return {
    outcome: "reward",
    reward: {
      epoch,
      timestamp: rewardTimestamp,
      lamports: BigInt(reward.amount),
    },
  };
}

/**
 * Prints a progress bar over the terminal's current line: 30 cells, as
 * many of them green as the share of epochs done, then the percentage and
 * the count of epochs, in reverse video, the terminal's text and
 * background colors swapped.
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
 * @returns {Promise<{rewards: Array, counts: Object}>} The rewards, and the epochs counted by outcome (`countEpochs`)
 */
async function fetchRewardsForEpochs(
  connection,
  votePubkey,
  currentEpoch,
  verbose,
  maxEpochs = null,
) {
  const rewards = [];
  const outcomes = [];

  const estimatedTotal =
    maxEpochs !== null && maxEpochs !== undefined ? maxEpochs : currentEpoch;

  const lastEpoch =
    maxEpochs !== null && maxEpochs !== undefined
      ? Math.max(0, currentEpoch - maxEpochs)
      : 0;
  console.log(
    `Processing epochs from ${currentEpoch - 1} back to epoch ${lastEpoch}...`,
  );

  const updateInterval = 5;

  for (let epoch = currentEpoch - 1; epoch >= 0; epoch--) {
    const found = await fetchSingleEpochReward(
      connection,
      votePubkey,
      epoch,
      verbose,
    );
    outcomes.push({ epoch, outcome: found.outcome });

    if (found.outcome === "reward") {
      rewards.push(found.reward);
      console.log(
        `Found reward in epoch ${epoch}: ${formatXnt(found.reward.lamports)} XNT`,
      );
    }

    if (!verbose && outcomes.length % updateInterval === 0) {
      displayProgressBar(outcomes.length, estimatedTotal);
    }

    if (
      maxEpochs !== null &&
      maxEpochs !== undefined &&
      outcomes.length >= maxEpochs
    ) {
      if (verbose)
        console.log(
          `Reached requested limit of ${maxEpochs} epochs. Stopping.`,
        );
      break;
    }
  }

  if (!verbose) process.stdout.write("\r" + " ".repeat(80) + "\r");

  const counts = countEpochs(outcomes);
  if (counts.failedEpochs > 0) {
    console.warn(
      `Warning: ${counts.failedEpochs} epochs failed to query (skipped gracefully).`,
    );
  }

  return { rewards, counts };
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
  console.log(`  Epochs without a reward: ${summary.epochsWithoutReward}`);
  console.log(`  Rewards without an XNT price: ${summary.rewardsWithoutPrice}`);
  console.log(
    `  Percentage of Expected Epochs with Rewards (from the first reward on, less failed queries): ${summary.percentageExpectedWithRewards}%`,
  );
  console.log(`  Average $XNT per epoch: ${summary.averagePerEpochXnt}`);
  console.log(`  Failed epoch queries: ${summary.failedEpochs}`);
  console.log(
    `  Unexpected failed epoch queries: ${summary.unexpectedFailures} (outside epochs 0 to 15)`,
  );
  if (summary.lowEpochFailures > 0) {
    console.log(
      `  Note: ${summary.lowEpochFailures} failed queries in epochs 0 to 15 are expected: X1's chain was rolled back early in its life, and its endpoint cannot give the rewards of some of those epochs.`,
    );
  }
}

/**
 * Main entry point: orchestrates the entire process.
 */
async function main() {
  let config;
  let refused = null;
  try {
    config = loadConfig();
  } catch (error) {
    refused = error;
    config = { ...DEFAULTS };
  }
  const argv = parseArguments(config);
  if (refused !== null) throw refused;

  const connection = createConnection(
    argv.rpcUrl,
    config.requestTimeoutSeconds,
  );
  const votePubkey = new PublicKey(argv.votePubkey);

  await logRpcHealth(connection, argv.verbose);
  await getVoteBalance(connection, votePubkey);

  await findVoteAccount(connection, votePubkey);

  const currentEpoch = await getCurrentEpoch(connection);

  const { rewards, counts } = await fetchRewardsForEpochs(
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

  // Optional JSON export, with the first epoch among those read in which
  // the account had a reward
  const firstRewardEpoch = Math.min(...rewards.map((reward) => reward.epoch));
  writeJsonExport(rows, summary, { currentEpoch, firstRewardEpoch }, argv.json);
}

endQuietlyWhenOutputCloses();
main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
