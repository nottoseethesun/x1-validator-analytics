/**
 * A stand-in X1 json-rpc endpoint, served on this computer, for tests that
 * run fetch-total-validator-earnings.js without the live chain.
 *
 * The script reaches X1 only through the endpoint its --rpc-url names, by
 * json-rpc over http. `startStandInX1` serves a stand-in of that endpoint on
 * a free local port and gives its url, so a test can run the script, in a
 * child process, against a chain whose answers the test controls. The
 * stand-in chain is at epoch 500, with X1's 216,000 slots per epoch, and
 * pays the vote account the same reward every epoch, at the first slot of
 * the next epoch. Its block times count back from now at X1's 0.366 seconds
 * per slot. It answers the five methods the script calls, and gives a
 * json-rpc error for any other.
 */

const http = require('http');

const SLOTS_PER_EPOCH = 216000;
const SECONDS_PER_SLOT = 0.366;
const CURRENT_EPOCH = 500;
const CURRENT_SLOT = CURRENT_EPOCH * SLOTS_PER_EPOCH + 1000;
const NODE_PUBKEY = 'StandInNode11111111111111111111111111111111';

/**
 * Answers one json-rpc call as the stand-in chain.
 *
 * @param {string} method - The json-rpc method
 * @param {Array} params - Its parameters
 * @param {{votePubkey: string, rewardLamports: number, nowSeconds: number}} chain - The chain's settings
 * @returns {{result: *}|{error: Object}} The answer's result, or its error
 */
function answer(method, params, chain) {
  switch (method) {
    case 'getEpochInfo':
      return {
        result: {
          absoluteSlot: CURRENT_SLOT,
          blockHeight: CURRENT_SLOT,
          epoch: CURRENT_EPOCH,
          slotIndex: 1000,
          slotsInEpoch: SLOTS_PER_EPOCH,
          transactionCount: 1
        }
      };
    case 'getBalance':
      return { result: { context: { slot: CURRENT_SLOT }, value: 5000000000 } };
    case 'getVoteAccounts':
      return {
        result: {
          current: [
            {
              votePubkey: chain.votePubkey,
              nodePubkey: NODE_PUBKEY,
              activatedStake: 1,
              epochVoteAccount: true,
              epochCredits: [[CURRENT_EPOCH - 100, 10, 0]],
              commission: 10,
              lastVote: CURRENT_SLOT,
              rootSlot: CURRENT_SLOT
            }
          ],
          delinquent: []
        }
      };
    case 'getInflationReward': {
      const config = params[1];
      const epoch = typeof config === 'number' ? config : config.epoch;
      return {
        result: [
          {
            epoch,
            effectiveSlot: (epoch + 1) * SLOTS_PER_EPOCH,
            amount: chain.rewardLamports,
            postBalance: 9000000000,
            commission: 10
          }
        ]
      };
    }
    case 'getBlockTime':
      return { result: Math.round(chain.nowSeconds - (CURRENT_SLOT - params[0]) * SECONDS_PER_SLOT) };
    default:
      return { error: { code: -32601, message: `The stand-in X1 endpoint has no ${method}` } };
  }
}

/**
 * Starts the stand-in endpoint on a free port of 127.0.0.1.
 *
 * @param {Object} options - The chain's settings
 * @param {string} options.votePubkey - The vote account the chain knows
 * @param {number} options.rewardLamports - The reward each epoch pays it, in lamports
 * @returns {Promise<{url: string, close: function(): Promise<void>}>} The endpoint's url, and a way to stop it
 */
function startStandInX1({ votePubkey, rewardLamports }) {
  const chain = { votePubkey, rewardLamports, nowSeconds: Math.floor(Date.now() / 1000) };
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const replyTo = (call) => ({ jsonrpc: '2.0', id: call.id, ...answer(call.method, call.params ?? [], chain) });
      const calls = JSON.parse(body);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(Array.isArray(calls) ? calls.map(replyTo) : replyTo(calls)));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
            server.closeAllConnections();
          })
      });
    });
  });
}

module.exports = { startStandInX1 };
