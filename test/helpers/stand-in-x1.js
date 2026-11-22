/**
 * A stand-in X1 json-rpc endpoint, served on this computer, for tests that
 * run fetch-total-validator-earnings.js without the live chain.
 * @module test/helpers/stand-in-x1
 *
 * The script reaches X1 only through the endpoint its --rpc-url names, by
 * json-rpc over http. `startStandInX1` serves a stand-in of that endpoint on
 * a free local port and gives its url, so a test can run the script, in a
 * child process, against a chain whose answers the test controls. The
 * stand-in chain uses X1's 216,000 slots per epoch, and pays the vote
 * account the same reward every epoch, at the first slot of the next epoch,
 * but in the epochs a test says it answers with no reward, as X1's live
 * endpoint answers for an epoch before an account began or one it missed,
 * and the epochs a test says fail, as X1's epoch 15 does after its
 * rollback. Its block times count back from the time the test names at
 * X1's 0.366 seconds per slot. It answers the five methods the script
 * calls, and gives a json-rpc error for any other; it gives the account's
 * credits for the last five epochs, as `getVoteAccounts` does. A test may
 * also have it answer nothing at all, as a stalled endpoint does, or stop
 * in the middle of its answer, as an endpoint whose connection hangs does.
 */

import http from "node:http";

/** Slots in an X1 epoch. */
export const SLOTS_PER_EPOCH = 216000;

/** Seconds per X1 slot. */
const SECONDS_PER_SLOT = 0.366;

/** The stand-in validator's identity. */
const NODE_PUBKEY = "StandInNode11111111111111111111111111111111";

/**
 * The chain's current slot: a thousand slots into its current epoch.
 *
 * @param {{currentEpoch: number}} chain - The chain's settings
 * @returns {number} The slot
 */
function currentSlot(chain) {
  return chain.currentEpoch * SLOTS_PER_EPOCH + 1000;
}

/**
 * The block time of a slot.
 *
 * @param {{currentEpoch: number, nowSeconds: number}} chain - The chain's settings
 * @param {number} slot - The slot
 * @returns {number} Its block time, in unix seconds
 */
function blockSeconds(chain, slot) {
  return Math.round(
    chain.nowSeconds - (currentSlot(chain) - slot) * SECONDS_PER_SLOT,
  );
}

/**
 * The block time of an epoch's reward: that of the first slot of the next
 * epoch.
 *
 * @param {{currentEpoch: number, nowSeconds: number}} chain - The chain's settings
 * @param {number} epoch - The epoch
 * @returns {number} The reward's block time, in unix seconds
 */
export function rewardSeconds(chain, epoch) {
  return blockSeconds(chain, (epoch + 1) * SLOTS_PER_EPOCH);
}

/**
 * Answers getInflationReward: the epoch's reward, or a json-rpc error for an
 * epoch the test says fails.
 *
 * @param {Array} params - The call's parameters
 * @param {Object} chain - The chain's settings
 * @returns {{result: *}|{error: Object}} The answer's result, or its error
 */
function inflationReward(params, chain) {
  const config = params[1];
  const epoch = typeof config === "number" ? config : config.epoch;
  if (epoch <= chain.failEpochsThrough || chain.failEpochs.includes(epoch)) {
    return {
      error: {
        code: -32004,
        message: `Block not available for epoch ${epoch}`,
      },
    };
  }
  if (epoch <= chain.noRewardThrough || chain.noRewardEpochs.includes(epoch))
    return { result: [null] };
  const reward = {
    epoch,
    effectiveSlot: (epoch + 1) * SLOTS_PER_EPOCH,
    amount: chain.rewardLamports,
    postBalance: 9000000000,
    commission: 10,
  };
  return { result: [reward] };
}

/**
 * Answers one json-rpc call as the stand-in chain.
 *
 * @param {string} method - The json-rpc method
 * @param {Array} params - Its parameters
 * @param {Object} chain - The chain's settings
 * @returns {{result: *}|{error: Object}} The answer's result, or its error
 */
function answer(method, params, chain) {
  const slot = currentSlot(chain);
  switch (method) {
    case "getEpochInfo":
      return {
        result: {
          absoluteSlot: slot,
          blockHeight: slot,
          epoch: chain.currentEpoch,
          slotIndex: 1000,
          slotsInEpoch: SLOTS_PER_EPOCH,
          transactionCount: 1,
        },
      };
    case "getBalance":
      return { result: { context: { slot }, value: 5000000000 } };
    case "getVoteAccounts":
      return {
        result: {
          current: [
            {
              votePubkey: chain.votePubkey,
              nodePubkey: NODE_PUBKEY,
              activatedStake: 1,
              epochVoteAccount: true,
              epochCredits: [4, 3, 2, 1, 0].map((back) => [
                chain.currentEpoch - back,
                100 - back * 10,
                90 - back * 10,
              ]),
              commission: 10,
              lastVote: slot,
              rootSlot: slot,
            },
          ],
          delinquent: [],
        },
      };
    case "getInflationReward":
      return inflationReward(params, chain);
    case "getBlockTime":
      return { result: blockSeconds(chain, params[0]) };
    default:
      return {
        error: {
          code: -32601,
          message: `The stand-in X1 endpoint has no ${method}`,
        },
      };
  }
}

/**
 * Starts the stand-in endpoint on a free port of 127.0.0.1.
 *
 * @param {Object} options - The chain's settings
 * @param {string} options.votePubkey - The vote account the chain knows
 * @param {number} options.rewardLamports - The reward each epoch pays it, in lamports
 * @param {number} options.nowSeconds - The chain's current time, in unix seconds
 * @param {number} [options.currentEpoch=500] - The chain's current epoch
 * @param {number} [options.failEpochsThrough=-1] - The last of the early epochs whose reward query fails
 * @param {number[]} [options.failEpochs=[]] - Other epochs whose reward query fails
 * @param {number} [options.noRewardThrough=-1] - The last of the early epochs answered with no reward for the account
 * @param {number[]} [options.noRewardEpochs=[]] - Other epochs answered with no reward for the account
 * @param {boolean} [options.stalled=false] - Whether it takes each request and answers none
 * @param {boolean} [options.stopsInBody=false] - Whether it answers each request with its headers and the start of a body, and sends no more
 * @returns {Promise<{url: string, chain: Object, close: function(): Promise<void>}>} The endpoint's url,
 *   the chain's settings, as `rewardSeconds` takes them, and a way to stop it
 */
export function startStandInX1({
  votePubkey,
  rewardLamports,
  nowSeconds,
  currentEpoch = 500,
  failEpochsThrough = -1,
  failEpochs = [],
  noRewardThrough = -1,
  noRewardEpochs = [],
  stalled = false,
  stopsInBody = false,
}) {
  const chain = {
    votePubkey,
    rewardLamports,
    nowSeconds,
    currentEpoch,
    failEpochsThrough,
    failEpochs,
    noRewardThrough,
    noRewardEpochs,
  };
  const server = http.createServer((request, response) => {
    if (stalled) return;
    if (stopsInBody) {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"jsonrpc":"2.0",');
      return;
    }
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const replyTo = (call) => ({
        jsonrpc: "2.0",
        id: call.id,
        ...answer(call.method, call.params ?? [], chain),
      });
      const calls = JSON.parse(body);
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify(
          Array.isArray(calls) ? calls.map(replyTo) : replyTo(calls),
        ),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        chain,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
