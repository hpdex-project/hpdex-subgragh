/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD, UNTRACKED_PAIRS } from './helpers'

const WETH_ADDRESS = '0xbe05ac1fb417c9ea435b37a9cecd39bc70359d31'
const USDC_WETH_PAIR = '' // created 10008355
const DAI_WETH_PAIR = '' // created block 10042267
const USDT_WETH_PAIR = '0x118e1317dc0469c9aedf7ade5d1aa1a47fc2f5b4' // created block 10093341
const OLD_USDT_WETH_PAIR = '0x0c85fe2dbc540386d2c1d907764956e18ea2ff6b' // created block 10093341

export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  // let daiPair = Pair.load(DAI_WETH_PAIR) // dai is token0
  // let usdcPair = Pair.load(USDC_WETH_PAIR) // usdc is token0
  let usdtPair = Pair.load(USDT_WETH_PAIR) // usdt is token1
  let oldUsdtPair = Pair.load(OLD_USDT_WETH_PAIR) // usdt is token1

    // // all 3 have been created
    // if (daiPair !== null && usdcPair !== null && usdtPair !== null) {
    //   let totalLiquidityETH = daiPair.reserve1.plus(usdcPair.reserve1).plus(usdtPair.reserve0)
    //   let daiWeight = daiPair.reserve1.div(totalLiquidityETH)
    //   let usdcWeight = usdcPair.reserve1.div(totalLiquidityETH)
    //   let usdtWeight = usdtPair.reserve0.div(totalLiquidityETH)
    //   return daiPair.token0Price
    //     .times(daiWeight)
    //     .plus(usdcPair.token0Price.times(usdcWeight))
    //     .plus(usdtPair.token1Price.times(usdtWeight))
    //   // dai and USDC have been created
    // } else if (daiPair !== null && usdcPair !== null) {
    //   let totalLiquidityETH = daiPair.reserve1.plus(usdcPair.reserve1)
    //   let daiWeight = daiPair.reserve1.div(totalLiquidityETH)
    //   let usdcWeight = usdcPair.reserve1.div(totalLiquidityETH)
    //   return daiPair.token0Price.times(daiWeight).plus(usdcPair.token0Price.times(usdcWeight))
    //   // USDC is the only pair so far
    // } else if (usdcPair !== null) {
    //   return usdcPair.token0Price
    // } else {
    //   return ZERO_BD
    // }

  if (oldUsdtPair !== null && usdtPair !== null) {
    let totalLiquidityETH = oldUsdtPair.reserve0.plus(usdtPair.reserve0)
    let oldUsdtWeight = oldUsdtPair.reserve0.div(totalLiquidityETH)
    let usdtWeight = usdtPair.reserve0.div(totalLiquidityETH)
    return oldUsdtPair.token1Price.times(oldUsdtWeight).plus(usdtPair.token1Price.times(usdtWeight))
  }else if (oldUsdtPair !== null) {
    return oldUsdtPair.token1Price
  } else {
    return ZERO_BD
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0xbe05ac1fb417c9ea435b37a9cecd39bc70359d31', // WHPB
  '0xa7be5e053cb523585a63f8f78b7dbca68647442f', // ESR
  '0x0f63352df611350201c419de9399a67e50d4b820', // ETH
  '0xe78984541a634c52c760fbf97ca3f8e7d8f04c85', // OLD USDT
  '0x6383f770f1eec68e80ac0c5527be71a11b4d182c', // HPD
  '0xd378634119d2f7b3cf3d60e0b0f5e048e74ce3cf', // New USDT
  '0x597e994b9f5a3e397c8c5cfdb3893bacddb8167d', //STEAM
	'0xf83811872d457532230a5f1f3cf0ca8f3aa0db55', //420
	'0x4ca7665a86fecd3c1df233d8ab72e82261ed838a', //HBB
  '0xdfe4051195a09a67defc36ce6bbb5e6edea745cb', //KING
]

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
let MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('1000')

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('2')

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == WETH_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]))
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair.token0 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token1 = Token.load(pair.token1)
        return pair.token1Price.times(token1.derivedETH as BigDecimal) // return token1 per our token * Eth per token 1
      }
      if (pair.token1 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token0 = Token.load(pair.token0)
        return pair.token0Price.times(token0.derivedETH as BigDecimal) // return token0 per our token * ETH per token 0
      }
    }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // dont count tracked volume on these pairs - usually rebass tokens
  if (UNTRACKED_PAIRS.includes(pair.id)) {
    return ZERO_BD
  }

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(2))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
