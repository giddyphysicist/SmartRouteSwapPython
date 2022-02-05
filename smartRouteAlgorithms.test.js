const { getSmartRouteSwapActions } = require('./smartRouteAlgorithms.js')
const { Big } = require('big.js')

test('Sanity check', () => {
  expect(true).toBe(true)
})

test('Checking Single Pool', () => {
  let pools = [
    {
      id: 3,
      token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      token2Id: 'wrap.near',
      token1Supply: '3261996451',
      token2Supply: '304306342709289283750201906',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'wrap.near'
  let outputToken =
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'
  let totalInput = new Big('10000000000000000000000')
  let slippageTolerance = 0.001
  let result = getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 3,
      token_in: 'wrap.near',
      token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      amount_in: '10000000000000000000000',
      min_amount_out: '106763',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking Two Identical Pools', () => {
  let pools = [
    {
      id: 3,
      token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      token2Id: 'wrap.near',
      token1Supply: '3261996451',
      token2Supply: '304306342709289283750201906',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 4,
      token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      token2Id: 'wrap.near',
      token1Supply: '3261996451',
      token2Supply: '304306342709289283750201906',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'wrap.near'
  let outputToken =
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'
  let totalInput = new Big('10000000000000000000000')
  let slippageTolerance = 0.001
  let result = getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 3,
      token_in: 'wrap.near',
      token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      amount_in: '5000000000000000000000',
      min_amount_out: '53382',
    },
    {
      pool_id: 4,
      token_in: 'wrap.near',
      token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      amount_in: '5000000000000000000000',
      min_amount_out: '53382',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking Single-Route Double-Hop (token1 --> token2 --> token3', () => {
  let pools = [
    {
      id: 1,
      token1Id: 'intermediateHop',
      token2Id: 'wrap.near',
      token1Supply: '50000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 2,
      token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      token2Id: 'intermediateHop',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'wrap.near'
  let outputToken =
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'
  let totalInput = new Big('10000000000000000000000')
  let slippageTolerance = 0.001
  let result = getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 1,
      token_in: 'wrap.near',
      token_out: 'intermediateHop',
      amount_in: '10000000000000000000000',
      min_amount_out: '49949499002016028',
    },
    {
      pool_id: 2,
      token_in: 'intermediateHop',
      token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      amount_in: '49949499002016028',
      min_amount_out: '33210925851152843',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking Three Identical Pools', () => {
  let pools = [
    {
      id: 3,
      token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      token2Id: 'wrap.near',
      token1Supply: '3261996451',
      token2Supply: '304306342709289283750201906',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 4,
      token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      token2Id: 'wrap.near',
      token1Supply: '3261996451',
      token2Supply: '304306342709289283750201906',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 5,
      token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      token2Id: 'wrap.near',
      token1Supply: '3261996451',
      token2Supply: '304306342709289283750201906',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'wrap.near'
  let outputToken =
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'
  let totalInput = new Big('10000000000000000000000')
  let slippageTolerance = 0.001
  let result = getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 3,
      token_in: 'wrap.near',
      token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      amount_in: '3333333333333333333334',
      min_amount_out: '35588',
    },
    {
      pool_id: 4,
      token_in: 'wrap.near',
      token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      amount_in: '3333333333333333333333',
      min_amount_out: '35588',
    },
    {
      pool_id: 5,
      token_in: 'wrap.near',
      token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
      amount_in: '3333333333333333333333',
      min_amount_out: '35588',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})
