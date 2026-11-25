# How the Script Decides Each Reward's Price

The script, `bin/end-user/fetch-total-validator-earnings.js`, lists the
inflation rewards an X1 validator's vote account received, those of
every epoch unless `--epochs` names how many of the last ones to read,
and gives each reward a price in USD: XNT's price at the reward's time,
and the reward's value at that price. This page follows that price from
start to finish: which time it is for, which market it comes from, how
the script reads it, and each case in which a reward gets no price.

## Contents

- [1. The Time a Reward Is Priced At](#1-the-time-a-reward-is-priced-at)
- [2. The Market the Price Comes From](#2-the-market-the-price-comes-from)
  - [Candles](#candles)
  - [The Pool](#the-pool)
  - [Why the Pool's Own Rate, Not GeckoTerminal's USD](#why-the-pools-own-rate-not-geckoterminals-usd)
- [3. The Candles the Script Asks For](#3-the-candles-the-script-asks-for)
- [4. A Reward's Price](#4-a-rewards-price)
  - [The Candle That Prices a Reward](#the-candle-that-prices-a-reward)
  - [A Reward in the Hour Not Yet Over](#a-reward-in-the-hour-not-yet-over)
- [5. When a Reward Gets No Price](#5-when-a-reward-gets-no-price)
- [6. The Value and the Totals](#6-the-value-and-the-totals)

## 1. The Time a Reward Is Priced At

The script asks the X1 rpc endpoint, the json-rpc api of an X1 node, for
each epoch's reward. The chain's answer names the slot in which the
reward was paid, early in the next epoch (its effective slot). The script
then asks for the time of that slot's block, and prices the reward at
that time:

- When a request for the time fails, the script asks again twice,
  two seconds apart; when the third request fails too, the run stops with
  exit code 1 and names the epoch.
- When the chain answers that it has no time for that block, or names no
  slot for the reward, the run stops the same way, at once.

So no reward gets an estimated time, and with it a price of the wrong
hour. An epoch whose reward the endpoint fails to give is left out of
the list, with a warning; it has no time to price.

## 2. The Market the Price Comes From

XNT, X1's coin, trades in the pools of decentralized exchanges on X1,
where people swap it for other tokens. A pool's price is the rate at
which it swaps one token for the other. The script reads XNT's price from
one such pool, through GeckoTerminal, a service that lists the pools of
decentralized exchanges with their prices and candles.

### Candles

GeckoTerminal gives a pool's prices as candles. A candle sums up a pool's
trades over one period, here one hour, from its open time: the first
price (open), the highest (high), the lowest (low) and the last (close).
GeckoTerminal makes no candle for an hour in which the pool had no trade.

### The Pool

The pool is the one `--liquidity-pool-address` names, or else
`liquidityPoolAddress` in `config.json`. By default it is the pool of
XDEX, a decentralized exchange on X1, that swaps WXNT, wrapped XNT, for
USDC.X, a USD stablecoin: a token kept at one US dollar. WXNT is XNT held
as a token, one WXNT for each XNT, which is how a pool holds X1's own
coin, so WXNT's price is XNT's. The script takes USDC.X at exactly $1,
so XNT's price in USDC.X is its price in USD.

When GeckoTerminal gives the pool's candles, the script checks, from its
answer, that the pool swaps XNT for the stablecoin, in either order: XNT
at `xntTokenAddress` and the stablecoin at `usdStablecoinAddress`, two
settings `config.json` may give, whose defaults, in
`settings/configLoader.js`, are the addresses of WXNT and USDC.X. A pool
that swaps anything else gives no prices (section 5).

### Why the Pool's Own Rate, Not GeckoTerminal's USD

GeckoTerminal can give a pool's candles in USD (`currency=usd`) or in the
pool's own rate, one token in the other (`currency=token`). For XNT, its
USD candles show one fixed price at every hour, whatever the pool's
trades: on 2026-11-16, every hour of the default pool's history showed
$0.26583, while the pool's own rate went from about 0.25 USDC.X on
2026-10-01 to about 0.19. So the script asks for the pool's own rate, XNT
in USDC.X, and never for GeckoTerminal's USD.

## 3. The Candles the Script Asks For

The script asks for the pool's hourly candles from a day before the
earliest reward of the run to the latest reward, through the GeckoTerminal
client of crypto-price-fetchers, the owner's repo of code his projects
share. The client asks for a thousand hourly candles at a time, newest
first, and stops at the earliest hour it needs, at the pool's first
candle, or where GeckoTerminal's public api stops serving:

- GeckoTerminal's X1 candles start on 2026-10-01.
- The public api answers a request only when the time it asks back from
  is within about the last 180 days. The client asks its last page from
  a day inside 180 days, and a page reaches a thousand hourly candles
  further back, so the oldest candle it can give is about 220 days old,
  older where hours went without a trade.

The client sends GeckoTerminal at most 20 requests a minute, and gives
each request 30 seconds to get its whole answer. When GeckoTerminal
refuses a request as one too many (status 429), the client sends it again
after 10 seconds, then 30, then 60. When it still refuses after the last
wait, answers with another error, or a request runs out of time, the
script gets no candles at all (section 5).

## 4. A Reward's Price

### The Candle That Prices a Reward

A reward's price is the close of the last candle that opened at or before
the reward's time, if that candle opened less than a day before it:

- When the pool traded in the reward's hour, that is the close of the
  reward's own hour.
- When the pool did not trade in that hour, there is no candle for it,
  and the price is the close of the last earlier hour with a trade: the
  last price the pool traded at before the reward.
- When the last candle at or before the reward opened a day or more
  before it, the reward gets no price (section 5): the pool's last trade
  before the reward fell in an hour that began a day or more before it.

### A Reward in the Hour Not Yet Over

A candle of an hour not yet over holds only the trades made so far, so
its close can still change. The script reads the clock once, before it
asks for any candle, and gives no price to a reward whose hour is not yet
over by that clock. An hour that ends while the candles are asked, through
a slow answer or a wait after a 429, still counts as not over, so no
candle that GeckoTerminal answered before its hour ended is taken. The
script warns of these rewards apart from the others with no price, and a
run once the hour is over prices them.

## 5. When a Reward Gets No Price

A reward gets no price in these cases, and the script never puts a
stand-in figure in its place:

| Case | Warning |
| --- | --- |
| The reward is before 2026-10-01, or before the pool's first candle, or older than the candles the public api serves (section 3), or the last candle at or before it opened a day or more before it (section 4). | The count of such rewards, the pool, and the open time of the earliest candle GeckoTerminal gave. |
| The reward's hour is not yet over (section 4). | The count of such rewards, and that a run once the hour is over prices them. |
| GeckoTerminal cannot give the candles (section 3), or the pool does not swap XNT for the stablecoin (section 2). Every reward of the run then has no price. | That there are no prices, with the error that says why. |

A reward with no price keeps its row, with its XNT amount, and has empty
price and value cells. The run still ends with exit code 0.

## 6. The Value and the Totals

A reward's XNT amount is exact to the lamport, XNT's smallest unit, a
billionth of an XNT. Its price is written with six decimal places, and
its value is its amount times that written price, rounded to four
decimal places, in USD, so each row multiplies out as shown. The running
USD total adds the values as written, and leaves out each reward with no
price. The summary counts the rewards with no price ("Rewards Without an
XNT Price").
