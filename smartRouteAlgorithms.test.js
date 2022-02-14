const { getSmartRouteSwapActions } = require('./smartRouteAlgorithms.js')
const { Big } = require('big.js')

test('Sanity check', () => {
  expect(true).toBe(true)
})

test('Checking Single Pool', async () => {
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
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
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

test('Checking Two Identical Pools', async () => {
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
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
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

test('Checking Single-Route Double-Hop (token1 --> token2 --> token3', async () => {
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
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
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

test('Checking Three Identical Pools', async () => {
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
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
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

test('Checking double-Parallel Hop followed by single Hop', async () => {
  let pools = [
    {
      id: 3,
      token1Id: 'token1.near',
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
      token1Id: 'token1.near',
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
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '10000000000000000000000000',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'token1.near'
  let outputToken = 'token2.near'
  let totalInput = new Big('1000000')
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 3,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '500000',
      min_amount_out: '46450651236192557479770',
    },
    {
      pool_id: 4,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '500000',
      min_amount_out: '46450651236192557479770',
    },
    {
      pool_id: 5,
      token_in: 'wrap.near',
      token_out: 'token2.near',
      amount_in: '92901302472385114959540',
      min_amount_out: '99899999892143',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking triple-Parallel Hop followed by single Hop', async () => {
  let pools = [
    {
      id: 3,
      token1Id: 'token1.near',
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
      token1Id: 'token1.near',
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
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '3261996451',
      token2Supply: '304306342709289283750201906',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },

    {
      id: 6,
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '10000000000000000000000000',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'token1.near'
  let outputToken = 'token2.near'
  let totalInput = new Big('1000000')
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 3,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '333334',
      min_amount_out: '30968740063981276684220',
    },
    {
      pool_id: 4,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '333333',
      min_amount_out: '30968647167411222222301',
    },
    {
      pool_id: 5,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '333333',
      min_amount_out: '30968647167411222222301',
    },
    {
      pool_id: 6,
      token_in: 'wrap.near',
      token_out: 'token2.near',
      amount_in: '92906034398803721128822',
      min_amount_out: '99899999892148',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking single hop followed by double-Parallel Hop', async () => {
  let pools = [
    {
      id: 3,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 4,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 5,
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '10000000000000000000000000',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'token2.near'
  let outputToken = 'token1.near'
  let totalInput = new Big('100000000000000000000')
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 5,
      token_in: 'token2.near',
      token_out: 'wrap.near',
      amount_in: '100000000000000000000',
      min_amount_out: '99899899799499',
    },
    {
      pool_id: 3,
      token_in: 'wrap.near',
      token_out: 'token1.near',
      amount_in: '49949949899749',
      min_amount_out: '49725536583031',
    },
    {
      pool_id: 4,
      token_in: 'wrap.near',
      token_out: 'token1.near',
      amount_in: '49949949899750',
      min_amount_out: '49725536583032',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking single hop followed by triple-Parallel Hop', async () => {
  let pools = [
    {
      id: 3,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 4,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 5,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 6,
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '10000000000000000000000000',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'token2.near'
  let outputToken = 'token1.near'
  let totalInput = new Big('100000000000000000000')
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 6,
      token_in: 'token2.near',
      token_out: 'wrap.near',
      amount_in: '100000000000000000000',
      min_amount_out: '99899899799499',
    },
    {
      pool_id: 3,
      token_in: 'wrap.near',
      token_out: 'token1.near',
      amount_in: '33299966599833',
      min_amount_out: '33155858866075',
    },
    {
      pool_id: 4,
      token_in: 'wrap.near',
      token_out: 'token1.near',
      amount_in: '33299966599833',
      min_amount_out: '33155858866075',
    },
    {
      pool_id: 5,
      token_in: 'wrap.near',
      token_out: 'token1.near',
      amount_in: '33299966599833',
      min_amount_out: '33155858866075',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking double-parallel hop followed by double-Parallel Hop', async () => {
  let pools = [
    {
      id: 3,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 4,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 5,
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 6,
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '10000000000000000000000000',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'token1.near'
  let outputToken = 'token2.near'
  let totalInput = new Big('1000000000000')
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 3,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '500000000000',
      min_amount_out: '497999017475',
    },
    {
      pool_id: 4,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '500000000000',
      min_amount_out: '497999017475',
    },
    {
      pool_id: 5,
      token_in: 'wrap.near',
      token_out: 'token2.near',
      amount_in: '497999017474',
      min_amount_out: '493557975275',
    },
    {
      pool_id: 6,
      token_in: 'wrap.near',
      token_out: 'token2.near',
      amount_in: '497999017476',
      min_amount_out: '493557975277',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})

test('Checking double-parallel hop followed by double-Parallel Hop, with direct hop as well', async () => {
  let pools = [
    {
      id: 3,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 4,
      token1Id: 'token1.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000000',
      token2Supply: '100000000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 5,
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '8961777751403231002448648',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 6,
      token1Id: 'token2.near',
      token2Id: 'wrap.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '10000000000000000000000000',
      update_time: 1643427419,
      token0_price: '0',
    },
    {
      id: 7,
      token1Id: 'token1.near',
      token2Id: 'token2.near',
      token1Supply: '100000000000000',
      token2Supply: '100000000000000',
      fee: 30,
      shares: '10000000000000000000000000',
      update_time: 1643427419,
      token0_price: '0',
    },
  ]
  let inputToken = 'token1.near'
  let outputToken = 'token2.near'
  let totalInput = new Big('1000000000000')
  let slippageTolerance = 0.1
  let result = await getSmartRouteSwapActions(
    pools,
    inputToken,
    outputToken,
    totalInput,
    slippageTolerance,
  )
  let expected = [
    {
      pool_id: 3,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '339717658922',
      min_amount_out: '338358661424',
    },
    {
      pool_id: 4,
      token_in: 'token1.near',
      token_out: 'wrap.near',
      amount_in: '339717658922',
      min_amount_out: '338358661424',
    },
    {
      pool_id: 7,
      token_in: 'token1.near',
      token_out: 'token2.near',
      amount_in: '320564682156',
      min_amount_out: '318266196846',
    },
    {
      pool_id: 5,
      token_in: 'wrap.near',
      token_out: 'token2.near',
      amount_in: '338358661424',
      min_amount_out: '335873195175',
    },
    {
      pool_id: 6,
      token_in: 'wrap.near',
      token_out: 'token2.near',
      amount_in: '338358661424',
      min_amount_out: '335873195175',
    },
  ]
  expect(JSON.stringify(result)).toBe(JSON.stringify(expected))
})
