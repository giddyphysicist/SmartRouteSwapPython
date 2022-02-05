const { default: Big } = require('big.js')
const { poolList } = require('./testPoolsData.js')
Big.DP = 40
Big.NE = -40
Big.PE = 40
// Is any configuration needed to do floor or enforce the number of decimal places?

function getBetaForRoute(route, path) {
  if (!route.length) {
    route = [route]
  }
  if (route.length == 1) {
    let p = route[0]
    var beta = new Big(p.reserves[path[0]])
  } else if (route.length == 2) {
    let p1 = route[0]
    let p2 = route[1]
    var beta = new Big(p1.reserves[path[0]]).times(
      new Big(p2.reserves[path[1]]),
    )
  }
  return beta
}

function getEpsilonForRoute(route, path) {
  if (!route.length) {
    route = [route]
  }
  if (route.length == 1) {
    // Single Hop case
    let p = route[0]
    let gamma = new Big(10000).minus(new Big(p.fee)).div(new Big(10000))
    var epsilon = Big(gamma)
  } else if (route.length == 2) {
    //Double Hop Case
    let p1 = route[0]
    let p2 = route[1]
    let gamma1 = new Big(10000).minus(new Big(p1.fee)).div(new Big(10000))
    let gamma2 = new Big(10000).minus(new Big(p2.fee)).div(Big(10000))
    var epsilon = new Big(p2.reserves[path[1]])
      .times(new Big(gamma1))
      .plus(new Big(p1.reserves[path[1]]).times(gamma1).times(gamma2))
  }
  return epsilon
}

function getAlphaForRoute(route, path) {
  if (!route.length) {
    route = [route]
  }
  if (route.length == 1) {
    //console.log('single hop')
    let p = route[0]
    let inputToken = path[0]
    let outputToken = path[1]
    let gamma = new Big(10000).minus(new Big(p.fee)).div(new Big(10000))
    let key1 = p.token1Id
    let key2 = p.token2Id
    let val1 = p.token1Supply
    let val2 = p.token2Supply
    p['reserves'] = { [key1]: val1, [key2]: val2 }
    var alpha = new Big(p.reserves[inputToken]).times(
      new Big(p.reserves[outputToken]).times(new Big(gamma)),
    )
  } else if (route.length == 2) {
    //console.log('double hop')
    let p1 = route[0]
    let p2 = route[1]
    let key11 = p1.token1Id
    let key12 = p1.token2Id
    let val11 = p1.token1Supply
    let val12 = p1.token2Supply
    p1['reserves'] = { [key11]: val11, [key12]: val12 }
    let key21 = p2.token1Id
    let key22 = p2.token2Id
    let val21 = p2.token1Supply
    let val22 = p2.token2Supply
    p2['reserves'] = { [key21]: val21, [key22]: val22 }
    let inputToken = path[0]
    let middleToken = path[1]
    let outputToken = path[2]
    let gamma1 = new Big(10000).minus(Big(p1.fee)).div(new Big(10000))
    let gamma2 = new Big(10000).minus(new Big(p2.fee)).div(new Big(10000))
    let alpha1 = new Big(p1.reserves[inputToken])
      .times(new Big(p1.reserves[middleToken]))
      .times(gamma1)
    let alpha2 = new Big(p2.reserves[middleToken])
      .times(new Big(p2.reserves[outputToken]))
      .times(gamma2)
    var alpha = alpha1.times(alpha2)
  }
  return alpha
}

function getAlphaSumFromRoutes(routes, nodeRoutes) {
  let alphaSum = new Big(0)
  for (var i in routes) {
    let route = routes[i]
    let nodeRoute = nodeRoutes[i]
    let alpha = getAlphaForRoute(route, nodeRoute)
    let radical = new Big(alpha).sqrt()
    let epsilon = getEpsilonForRoute(route, nodeRoute)
    let denom = new Big(epsilon)
    alphaSum = alphaSum.plus(radical.div(denom))
  }
  return alphaSum
}

function getBetaSumFromRoutes(routes, nodeRoutes) {
  let betaSum = new Big(0)
  for (var i in routes) {
    let route = routes[i]
    let nodeRoute = nodeRoutes[i]
    let num = new Big(getBetaForRoute(route, nodeRoute))
    let denom = new Big(getEpsilonForRoute(route, nodeRoute))
    betaSum = betaSum.plus(num.div(denom))
  }
  return betaSum
}

function getPhiFromRoutes(routes, nodeRoutes, totalInput) {
  let alphaSum = getAlphaSumFromRoutes(routes, nodeRoutes)
  let betaSum = getBetaSumFromRoutes(routes, nodeRoutes)
  // console.log('ALPHASUM IS ...')
  // console.log(alphaSum.toString())
  // console.log('BETASUM IS...')
  // console.log(betaSum.toString())
  // console.log('FOR ROUTES...')
  // console.log(routes)
  let phi = new Big(totalInput).plus(betaSum).div(alphaSum)
  return phi
}

function getAllocationForRoute(phi, route, path) {
  let alpha = getAlphaForRoute(route, path)
  let beta = getBetaForRoute(route, path)
  let epsilon = getEpsilonForRoute(route, path)
  let allocation = new Big(phi)
    .abs()
    .times(new Big(alpha).sqrt())
    .minus(beta)
    .div(epsilon)
  return allocation
}

function getAllocationVectorForRoutes(phi, routes, nodeRoutes) {
  let allocationVec = []
  for (var i in routes) {
    allocationVec.push(getAllocationForRoute(phi, routes[i], nodeRoutes[i]))
  }
  return allocationVec
}

function getOptimalAllocationForRoutes(routes, nodeRoutes, totalInput) {
  // console.log("CALLING GET OPTIMAL ALLOCATION FOR ROUTES:")
  // console.log(routes)
  var totalInput = new Big(totalInput)
  let phi = getPhiFromRoutes(routes, nodeRoutes, totalInput)
  // console.log('PHI CALCULATED TO BE...')
  // console.log(phi.toString())
  let allocations = getAllocationVectorForRoutes(phi, routes, nodeRoutes)
  if (allocations.every((item) => item.lt(new Big(0)))) {
    console.log('all allocations were negative...')
    allocations = allocations.map((item) => item.times(new Big(-1.0)))
  }
  if (allocations.some((item) => item.lt(new Big(0)))) {
    allocations = reduceRoutes(routes, nodeRoutes, allocations, totalInput)
  }
  let sumAllocations = allocations.reduce((a, b) => a.plus(b), new Big(0))
  let normalizedAllocations = allocations.map((a) =>
    a.div(sumAllocations).times(new Big(totalInput)),
  )
  return normalizedAllocations
}

function reduceRoutes(routes, nodeRoutes, allocationVec, totalInput) {
  // console.log("RUNNING REDUCE ROUTES")
  var totalInput = new Big(totalInput)
  let goodIndices = []
  for (var i in allocationVec) {
    let dx = allocationVec[i]
    // console.log('DX IS...')
    // console.log(dx.toString())
    if (dx.gt(new Big(0))) {
      goodIndices.push(i)
    }
  }
  console.log('GOOD INDICES ARE...')
  console.log(goodIndices)
  let newRoutes = []
  let newNodeRoutes = []
  for (var i in goodIndices) {
    let goodIndex = goodIndices[i]
    newRoutes.push(routes[goodIndex])
    newNodeRoutes.push(nodeRoutes[goodIndex])
  }
  allocationVec = getOptimalAllocationForRoutes(
    newRoutes,
    newNodeRoutes,
    totalInput,
  )
  let allocationDict = {}
  for (var i in goodIndices) {
    allocationDict[goodIndices[i]] = allocationVec[i]
  }
  var allocationVecNew = []
  for (var i in routes) {
    if (goodIndices.includes(i)) {
      allocationVecNew.push(allocationDict[i])
    } else {
      let zeroAllocation = new Big(0)
      allocationVecNew.push(zeroAllocation)
    }
  }
  return allocationVecNew
}

function getNodeRoutesFromPathsAndPoolChains(paths, poolChains) {
  let multiplicity = []
  for (var i in poolChains) {
    let pc = poolChains[i]
    let mul = pc
      .map((item) => item.length)
      .reduce((elem1, elem2) => elem1 * elem2, 1)
    multiplicity.push(mul)
  }
  let nodeRoutes = []
  for (var j in paths) {
    let path = paths[j]
    let m = multiplicity[j]
    for (var k = 0; k < m; k++) {
      nodeRoutes.push(path)
    }
  }
  return nodeRoutes
}

function getPoolChainFromPaths(paths, pools, threshold = 0.001) {
  let poolChains = []
  for (var pathInd in paths) {
    let path = paths[pathInd]
    let chain = []
    let pairs = []
    for (var i = 0; i < path.length - 1; i++) {
      pairs.push([path[i], path[i + 1]])
    }
    for (var pairInd in pairs) {
      let pair = pairs[pairInd]
      let tokenPools = getPoolsByToken1ANDToken2(pools, pair[0], pair[1])
      chain.push(tokenPools)
    }
    poolChains.push(chain)
  }
  // return poolChains;
  let culledPoolChains = getCulledPoolChains(poolChains, threshold)
  return culledPoolChains
}

function getCulledPoolChains(poolChains, threshold = 0.001) {
  let newChains = []
  for (var pathInd in poolChains) {
    let path = poolChains[pathInd]
    let newPath = []
    for (var legInd in path) {
      let leg = path[legInd]
      let culledPath = cullPoolsWithInsufficientLiquidity(leg, threshold)
      newPath.push(culledPath)
    }
    newChains.push(newPath)
  }
  return newChains
}

function getRoutesFromPoolChain(poolChains) {
  let routes = []
  for (var pci in poolChains) {
    let poolChain = poolChains[pci]
    //get cartesian product of each pool chain to get the list of routes.
    let newRoutes = cartesianProduct(poolChain)
    routes.push(...newRoutes)
  }
  return routes
}

function getOutputSingleHop(pool, inputToken, outputToken, totalInput) {
  var totalInput = new Big(totalInput)
  // check if pool is forward or backward for inputToken/outputToken cf. token1Id/token2Id
  if (inputToken === pool.token1Id && outputToken === pool.token2Id) {
    // forward Pool
    var reserves = {
      [inputToken]: new Big(pool.token1Supply),
      [outputToken]: new Big(pool.token2Supply),
    }
  } else if (inputToken === pool.token2Id && outputToken === pool.token1Id) {
    // reverse pool
    var reserves = {
      [outputToken]: new Big(pool.token1Supply),
      [inputToken]: new Big(pool.token2Supply),
    }
  } else {
    //got the wrong pool.
    console.log(
      `INPUT TOKENS ${inputToken} and ${outputToken} DO NOT EXIST IN THIS POOL, which contains ${pool.token1Id} and ${pool.token2Id}`,
    )
    return new Big(0)
  }
  let gamma = new Big(10000).minus(new Big(pool.fee)).div(new Big(10000))
  // console.log(totalInput)
  // console.log(gamma)
  // console.log(reserves)
  let num = totalInput.times(gamma).times(reserves[outputToken])
  let denom = reserves[inputToken].plus(gamma.times(totalInput))
  return num.div(denom)
}

function getOutputDoubleHop(
  pools,
  inputToken,
  middleToken,
  outputToken,
  totalInput,
) {
  var totalInput = new Big(totalInput)
  for (var poolIndex in pools) {
    let p = pools[poolIndex]
    p['gamma'] = new Big(10000).minus(new Big(p.fee)).div(new Big(10000))
  }
  let p1 = pools[0]
  let p2 = pools[1]

  if (inputToken === p1.token1Id && middleToken === p1.token2Id) {
    // forward Pool
    p1['reserves'] = {
      inputToken: new Big(p1.token1Supply),
      middleToken: new Big(p1.token2Supply),
    }
  } else if (middleToken === p1.token1Id && inputToken === p1.token2Id) {
    //reverse pool
    p1['reserves'] = {
      middleToken: new Big(p1.token1Supply),
      inputToken: new Big(p1.token2Supply),
    }
  }

  if (middleToken === p2.token1Id && outputToken === p2.token2Id) {
    // forward Pool
    p2['reserves'] = {
      middleToken: new Big(p2.token1Supply),
      outputToken: new Big(p2.token2Supply),
    }
  } else if (outputToken === p2.token1Id && middleToken === p2.token2Id) {
    //reverse pool
    p2['reserves'] = {
      outputToken: new Big(p2.token1Supply),
      middleToken: new Big(p2.token2Supply),
    }
  }

  let c1 = new Big(p1.reserves.middleToken)
  let a1 = new Big(p1.reserves.inputToken)
  let c2 = new Big(p2.reserves.middleToken)
  let b2 = new Big(p2.reserves.outputToken)
  let gamma1 = p1.gamma
  let gamma2 = p2.gamma
  let num = totalInput.times(c1).times(b2).times(gamma1).times(gamma2)
  let denom = c2
    .times(a1)
    .plus(
      totalInput.times(c2.times(gamma1).plus(c1.times(gamma1).times(gamma2))),
    )
  // denom = c2*a1 + totalInput * (c2*gamma1 + c1*gamma1*gamma2)

  return num.div(denom)
}

function getOutputFromRoute(route, nodeRoute, allocation) {
  if (new Big(allocation).eq(new Big(0))) {
    return new Big(0)
  } else {
    var allocation = new Big(allocation)
  }
  if (!route.length) {
    route = [route]
  }
  if (route.length == 1) {
    // single hop
    let inputToken = nodeRoute[0]
    let outputToken = nodeRoute[1]
    let pool = route[0]
    var output = getOutputSingleHop(pool, inputToken, outputToken, allocation)
  } else if (route.length == 2) {
    // DOUBLE HOP
    let inputToken = nodeRoute[0]
    let middleToken = nodeRoute[1]
    let outputToken = nodeRoute[2]
    let pools = route
    var output = getOutputDoubleHop(
      pools,
      inputToken,
      middleToken,
      outputToken,
      allocation,
    )
  }
  return output
}

function getOptOutputVec(routes, nodeRoutes, totalInput) {
  let allocations = getOptimalAllocationForRoutes(
    routes,
    nodeRoutes,
    totalInput,
  )
  let result = []
  for (var i in routes) {
    let route = routes[i]
    let nodeRoute = nodeRoutes[i]
    let allocation = allocations[i]
    let output = getOutputFromRoute(route, nodeRoute, allocation)
    result.push(output)
  }
  return {
    result: result,
    allocations: allocations,
  }
  //NOTE -- I made this return an object instead of the tuple returned in python. need to check the places it is called, and specify
  // result field instead of tuple 0 position, and allocations field instead of tuple 1 position.
}

function getBestOptOutput(routes, nodeRoutes, totalInput) {
  let outputRefined = getOptOutputVecRefined(routes, nodeRoutes, totalInput)
    .result
  let outputRaw = getOptOutputVec(routes, nodeRoutes, totalInput).result
  let res1 = new Big(0)
  let res2 = new Big(0)

  for (var n in outputRefined) {
    res1 = res1.plus(outputRefined[n])
  }
  for (var nn in outputRaw) {
    res2 = res2.plus(outputRaw[nn])
  }
  if (res1.gt(res2)) {
    return res1
  } else {
    return res2
  }
}

function getBestOptInput(routes, nodeRoutes, totalInput) {
  let refDict = getOptOutputVecRefined(routes, nodeRoutes, totalInput)
  let outputRefined = refDict.result
  let inputRefined = refDict.allocations
  let rawDict = getOptOutputVec(routes, nodeRoutes, totalInput)
  let outputRaw = rawDict.result
  let inputRaw = rawDict.allocations
  let res1 = new Big(0)
  let res2 = new Big(0)

  for (var n in outputRefined) {
    res1 = res1.plus(outputRefined[n])
  }
  for (var nn in outputRaw) {
    res2 = res2.plus(outputRaw[nn])
  }
  // console.log('COMPARING SINGLE HOPS VS DOUBLE')
  // console.log(res1.toString())
  // console.log(res2.toString())
  if (res1.gt(res2)) {
    return inputRefined
  } else {
    return inputRaw
  }
}

function getOptOutputVecRefined(routes, nodeRoutes, totalInput) {
  let initLengthRoutes = routes.length
  let directRouteInds = []
  for (var routeInd in routes) {
    let route = routes[routeInd]
    if (!route.length) {
      route = [route]
    }
    if (route.length == 1) {
      directRouteInds.push(routeInd)
    }
  }
  // console.log('DIRECT ROUTE INDS ARE')
  // console.log(directRouteInds)
  if (directRouteInds.length < 1) {
    var allocations = getOptimalAllocationForRoutes(
      routes,
      nodeRoutes,
      totalInput,
    )
    var result = []
    for (var i in routes) {
      let r = routes[i]
      let nr = nodeRoutes[i]
      let a = allocations[i]
      let output = getOutputFromRoute(r, nr, a)
      result.push(output)
    }
  } else {
    // console.log('DOING SINGLE HOP ONLY')
    let droutes = []
    let dnodeRoutes = []
    for (var dri in directRouteInds) {
      let ind = directRouteInds[dri]
      droutes.push(routes[ind])
      dnodeRoutes.push(nodeRoutes[ind])
    }
    let dallocations = getOptimalAllocationForRoutes(
      droutes,
      dnodeRoutes,
      totalInput,
    )
    let dallocDict = {}
    for (var dd in dallocations) {
      dallocDict[directRouteInds[dd]] = dallocations[dd]
    }
    var allocations = []

    for (var ii = 0; ii < initLengthRoutes; ii++) {
      if (directRouteInds.includes(ii.toString())) {
        //console.log('ADDING ALLOCATION FOR SINGLE ROUTE')
        allocations.push(dallocDict[ii])
      } else {
        allocations.push(new Big(0))
      }
    }
    var result = []
    for (var j in routes) {
      let route = routes[j]
      let nodeRoute = nodeRoutes[j]
      let allocation = allocations[j]
      let output = getOutputFromRoute(route, nodeRoute, allocation)
      result.push(output)
    }
  }
  return {
    result: result,
    allocations: allocations,
  }
}

function getBestOptimalAllocationsAndOutputs(
  pools,
  inputToken,
  outputToken,
  totalInput,
) {
  var totalInput = new Big(totalInput)
  let paths = getPathsFromPools(pools, inputToken, outputToken)
  let poolChains = getPoolChainFromPaths(paths, pools)
  let routes = getRoutesFromPoolChain(poolChains)
  let nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)
  let allocations = getBestOptInput(routes, nodeRoutes, totalInput)
  // fix integer rounding for allocations:
  allocations = checkIntegerSumOfAllocations(allocations, totalInput)

  let outputs = getBestOptOutput(routes, nodeRoutes, totalInput)
  return {
    allocations: allocations,
    outputs: outputs,
    routes: routes,
    nodeRoutes: nodeRoutes,
  }
}

function getActionListFromRoutesAndAllocations(
  routes,
  nodeRoutes,
  allocations,
  slippageTolerance,
) {
  // TODO: need to add in minimumAmountOut for each action instead of a hop Multiplier
  // TODO: need to consolidate sub-parallel swap paths - need middle token checks.
  //console.log(allocations.map((item) => item.toString()))
  let actions = []
  for (var i in routes) {
    let route = routes[i]
    let nodeRoute = nodeRoutes[i]
    let allocation = new Big(allocations[i])
    if (allocation.eq(new Big(0))) {
      continue
    }
    if (!route.length) {
      route = [route]
    }
    if (route.length === 1) {
      //single hop. only one action.
      let pool = route[0]
      let poolId = pool.id
      let inputToken = nodeRoute[0]
      let outputToken = nodeRoute[1]
      let expectedAmountOut = getOutputSingleHop(
        pool,
        inputToken,
        outputToken,
        allocation,
      )
      let minimumAmountOut = expectedAmountOut
        .times(new Big(1).minus(slippageTolerance))
        .round()
        .toString() //Here, assume slippage tolerance is a fraction. So 1% would be 0.01
      let action = {
        pool_id: poolId,
        token_in: inputToken,
        token_out: outputToken,
        amount_in: allocation.round().toString(),
        min_amount_out: minimumAmountOut.toString(),
      }
      actions.push(action)
    } else if (route.length === 2) {
      // double hop. two actions.
      let pool1 = route[0]
      let pool2 = route[1]
      let pool1Id = pool1.id
      let pool2Id = pool2.id
      let inputToken = nodeRoute[0]
      let middleToken = nodeRoute[1]
      let outputToken = nodeRoute[2]
      let expectedAmountOutFirstHop = getOutputSingleHop(
        pool1,
        inputToken,
        middleToken,
        allocation,
      )
      let minimumAmountOutFirstHop = expectedAmountOutFirstHop
        .times(new Big(1).minus(slippageTolerance))
        .round()
        .toString() //Here, assume slippage tolerance is a fraction. So 1% would be 0.01

      let action1 = {
        pool_id: pool1Id,
        token_in: inputToken,
        token_out: middleToken,
        amount_in: allocation.round().toString(),
        min_amount_out: minimumAmountOutFirstHop,
      }
      let expectedFinalAmountOut = getOutputSingleHop(
        pool2,
        middleToken,
        outputToken,
        minimumAmountOutFirstHop,
      )
      let minimumAMountOutSecondHop = expectedFinalAmountOut
        .times(new Big(1).minus(slippageTolerance))
        .round()
        .toString()
      let action2 = {
        pool_id: pool2Id,
        token_in: middleToken,
        token_out: outputToken,
        amount_in: minimumAmountOutFirstHop,
        min_amount_out: minimumAMountOutSecondHop,
      }
      actions.push(action1)
      actions.push(action2)
    }
  }
  return actions
}

//     #middleTokenTotals = getMiddleTokenTotals(routes,nodeRoutes,allocations)
//     #TODO: complete this function with middle token checks.

//     #consider all routes of length 2 with non-zero allocation. (double-hops)
//     # among these, check for parallel swaps. That is, check for common node routes
//     # for first hop. Then check for common node routes on second hop.
//     # when common node routes occur for the first hop:
//     # 1. Calculate the total expected output of intermediate token.
//     # 2.
//     # when common node routes occur for the second hop:
//     # 1. get a ratio of the input allocations of the full routes associated with
//     # these common node routes. allocate the total intermediate token output
//     # toward these 2nd hop routes in the same ratio as their route input allocations.

function getSmartRouteSwapActions(
  pools,
  inputToken,
  outputToken,
  totalInput,
  slippageTolerance,
) {
  if (!totalInput) {
    return []
  }
  var totalInput = new Big(totalInput)
  let resDict = getBestOptimalAllocationsAndOutputs(
    pools,
    inputToken,
    outputToken,
    totalInput,
  )
  let allocations = resDict.allocations
  // let outputs = resDict.outputs;
  let routes = resDict.routes
  let nodeRoutes = resDict.nodeRoutes
  let actions = getActionListFromRoutesAndAllocations(
    routes,
    nodeRoutes,
    allocations,
    slippageTolerance,
  )
  let distilledActions = distillCommonPoolActions(actions)
  return distilledActions
}

function distillCommonPoolActions(actions) {
  //     #Note, if there are multiple transactions for a single pool, it might lead to sub-optimal
  //     #returns. This is due to the fact that the routes are treated as independent, where
  //     #here, if one transaction goes through in a pool, it changes the price of the asset
  //     #before the second transaction can occur.

  //     #combine same-pool transactions into single transaction:
  let poolsUsedPerAction = actions.map((item) => item.pool_id)
  let axnSet = []
  let repeats = false
  for (var i in poolsUsedPerAction) {
    if (axnSet.includes(poolsUsedPerAction[i])) {
      repeats = true
      break
    } else {
      axnSet.push(poolsUsedPerAction[i])
    }
  }
  if (repeats) {
    var pid = {}
    for (var ai in actions) {
      let a = actions[ai]
      let currentPoolId = a.pool_id
      if (Object.keys(pid).includes(currentPoolId)) {
        pid.currentPoolId.push(a)
      } else {
        pid[currentPoolId] = [a]
      }
    }
    var newActions = []
    var poolIds = Object.keys(pid)
    for (var pi in poolIds) {
      let poolId = poolIds[pi]
      let actionList = pid[poolId]
      console.log(actionList)
      if (actionList.length == 1) {
        var poolTotalInput = new Big(actionList[0].amount_in)
      } else {
        var poolTotalInput = actionList.reduce(
          (a, b) => new Big(a.amount_in) + new Big(b.amount_in),
          new Big(0),
        )
      }

      let inputToken = actionList[0].token_in
      let outputToken = actionList[0].token_out
      let pool = pools.filter((item) => item.id.toString() === poolId)[0]
      let expectedMinimumOutput = getOutputSingleHop(
        pool,
        inputToken,
        outputToken,
        poolTotalInput,
      ).times(new Big(1).minus(new Big(slippageTolerance)))
      let newAction = {
        pool_id: poolId,
        token_in: inputToken,
        token_out: outputToken,
        amount_in: poolTotalInput.round().toString(),
        min_amount_out: expectedMinimumOutput.round().toString(),
      }
      newActions.push(newAction)
    }
  } else {
    var newActions = actions
  }
  return newActions
}

// pool =
// {"id": 19,
// "token1Id": "wrap.near",
// "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
// "token1Supply": "458507706848275237144751",
// "token2Supply": "4773827",
// "fee": 20,
// "shares": "1433530386500514261296380",
// "update_time": 1643427419,
// "token0_price": "0"}

//////////////////////////////////////////////////////////////
// UTILITIES
//////////////////////////////////////////////////////////////
function getPoolsByToken1ORToken2(pools, token1, token2) {
  let filteredPools = pools.filter(
    (item) =>
      item.token1Id === token1 ||
      item.token2Id === token1 ||
      item.token1Id === token2 ||
      item.token2Id === token2,
  )
  return filteredPools
}

function getPoolsByToken1ANDToken2(pools, token1, token2) {
  let filteredPools = pools.filter(
    (item) =>
      (item.token1Id === token1 && item.token2Id === token2) ||
      (item.token1Id === token2 && item.token2Id === token1),
  )
  return filteredPools
}

function getLiqudityOfPoolsFromList(pools) {
  let liquidities = []
  for (var poolInd in pools) {
    let pool = pools[poolInd]
    pool.amounts = [pool.token1Supply, pool.token2Supply]
    let poolBigAmounts = pool.amounts.map((item) => new Big(item))
    let liquidity = poolBigAmounts[0].times(poolBigAmounts[1])
    liquidities.push(liquidity)
  }
  return liquidities
}

function getNormalizedLiquiditiesFromList(pools) {
  let liquidities = getLiqudityOfPoolsFromList(pools)
  let maxLiq = bigMax(liquidities)
  let normalizedLiquidities = liquidities.map((item) => item.div(maxLiq))
  return normalizedLiquidities
}

function bigMax(arrayOfBigs) {
  if (arrayOfBigs.length < 1) {
    return null
  }
  let maxElem = arrayOfBigs[0]
  for (var ind in arrayOfBigs) {
    let val = arrayOfBigs[ind]
    if (val.gt(maxElem)) {
      maxElem = val
    }
  }
  return maxElem
}

function cullPoolsWithInsufficientLiquidity(pools, threshold = 0.001) {
  var thresh = new Big(threshold)
  let normLiq = getNormalizedLiquiditiesFromList(pools)
  filteredPools = []
  for (var i = 0; i < normLiq.length; i++) {
    if (normLiq[i] > thresh) {
      filteredPools.push(pools[i])
    }
  }
  return filteredPools
}

function cartesianProduct(a) {
  let result = a.reduce((a, b) => a.flatMap((d) => b.map((e) => [d, e].flat())))
  return result
}

function checkIntegerSumOfAllocations(allocations, totalInput) {
  var totalInput = new Big(totalInput)
  var allocations = allocations.map((item) => item.round())
  let alloSum = allocations
    .map((item) => new Big(item))
    .reduce((a, b) => a.plus(b), new Big(0))
  let offset = totalInput.minus(alloSum)
  //get largest allocation.
  let currMax = new Big(0)
  let currMaxInd = 0
  for (var i in allocations) {
    if (allocations[i].gt(currMax)) {
      currMaxInd = i
      currMax = allocations[i]
    }
  }
  let newAllocations = []
  for (var j in allocations) {
    if (j === currMaxInd) {
      newAllocations.push(allocations[j].plus(offset).toString())
    } else {
      newAllocations.push(allocations[j].toString())
    }
  }
  return newAllocations
}

function addEdge(g, edge) {
  let src = edge[0]
  let dst = edge[1]
  if (Object.keys(g).includes(src)) {
    if (!Object.keys(g[src]).includes(dst)) {
      g[src][dst] = 1
    }
  } else {
    g[src] = {}
    g[src][dst] = 1
  }
  if (Object.keys(g).includes(dst)) {
    if (!Object.keys(g[dst]).includes(src)) {
      g[dst][src] = 1
    }
  } else {
    g[dst] = {}
    g[dst][src] = 1
  }
}

function addEdges(g, edgeList) {
  for (var n in edgeList) {
    let edge = edgeList[n]
    //console.log(edge);
    addEdge(g, edge)
  }
}

function deleteEdge(g, edge) {
  let gNew = JSON.parse(JSON.stringify(g)) // using this to deep clone graph structure
  let e1 = edge[0]
  let e2 = edge[1]
  if (Object.keys(gNew).includes(e1)) {
    if (Object.keys(gNew[e1]).includes(e2)) {
      delete gNew[e1][e2]
    }
  }
  if (Object.keys(gNew).includes(e2)) {
    if (Object.keys(gNew[e2]).includes(e1)) {
      delete gNew[e2][e1]
    }
  }
  return gNew
}

function deleteNode(g, node) {
  let gNew = JSON.parse(JSON.stringify(g)) // using this to deep clone graph structure
  if (Object.keys(gNew).includes(node)) {
    delete gNew[node]
  }
  let keys = Object.keys(gNew)
  for (var nodeInd in keys) {
    let nodeNow = keys[nodeInd]
    if (Object.keys(gNew[nodeNow]).includes(node)) {
      delete gNew[nodeNow][node]
    }
  }
  return gNew
}

function dijkstra(graph, s) {
  var solutions = {}
  solutions[s] = {}
  solutions[s].path = []
  solutions[s].dist = 0

  while (true) {
    var parent = null
    var nearest = null
    var dist = Infinity

    //for each existing solution
    for (var n in solutions) {
      if (!solutions[n]) {
        solutions[n] = {}
      }
      if (!solutions[n].path) continue
      var ndist = solutions[n].dist
      var adj = graph[n]
      //for each of its adjacent nodes...
      for (var a in adj) {
        //without a solution already...
        if (!solutions[a]) {
          solutions[a] = {}
        }
        if (solutions[a].path) continue
        //choose nearest node with lowest *total* cost
        var d = adj[a] + ndist
        if (d < dist) {
          //reference parent
          parent = solutions[n].path
          nearest = a
          dist = d
        }
      }
    }

    //no more solutions
    if (dist === Infinity) {
      break
    }

    //extend parent's solution path
    solutions[nearest].path = parent.concat(nearest)
    //extend parent's cost
    solutions[nearest].dist = dist
  }

  return solutions
}

function shortestPath(g, src, dst, ignore_nodes = [], ignore_edges = []) {
  let gTemp = JSON.parse(JSON.stringify(g)) // using this to deep clone graph structure. If we can use lodash, could use  _.cloneDeep(obj)
  // remove nodes
  for (var nodeInd in ignore_nodes) {
    let nodeNow = ignore_nodes[nodeInd]
    gTemp = deleteNode(gTemp, nodeNow)
  }
  // remove edges
  for (var edgeInd in ignore_edges) {
    let edgeNow = ignore_edges[edgeInd]
    gTemp = deleteEdge(gTemp, edgeNow)
  }
  let solution = dijkstra(gTemp, src)[dst]
  solution.path.unshift(src) // original algorithm doesn't include source node in path
  return solution
}

function* count(firstval = 0, step = 1) {
  let x = firstval
  while (true) {
    yield x
    x = x + 1
  }
}

class PathBuffer {
  constructor() {
    this.paths = []
    this.sortedpaths = []
    //this.counter = count();
  }
  len() {
    return this.sortedpaths.length
  }

  push(cost, path) {
    if (path && !arrayContains(this.paths, path)) {
      this.sortedpaths.push([cost, path])
      this.sortedpaths.sort(function (a, b) {
        return a[0] - b[0]
      })
      //heappush(this.sortedpaths, (cost, this.counter.next().value,path));
      this.paths.push(path)
    }
  }

  pop() {
    //let val = heappop(this.sortedpaths);
    let val = this.sortedpaths.shift()
    let cost = val[0]
    let path = val[1]
    this.paths.splice(this.paths.indexOf(path), 1)
    return path
  }
}

function arrayEquals(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index])
  )
}

function arrayContains(arr, obj) {
  // checks to see if the input array contains a reference object, obj, using
  // JSON.stringify() .
  let obj_json = JSON.stringify(obj)
  for (itemInd in arr) {
    if (JSON.stringify(arr[itemInd]) == obj_json) {
      return true
    }
  }
  return false
}

function* yenFromPy(g, source, target) {
  //adapted from the python implementation in networkx.algorithms.simple_paths.shortest_simple_paths()
  let listA = []
  let listB = new PathBuffer()
  let prev_path = null

  while (true) {
    if (!prev_path) {
      let sol = shortestPath(g, source, target)
      let length = sol.dist
      let path = sol.path
      listB.push(length, path)
    } else {
      let ignore_nodes = []
      let ignore_edges = []
      for (var i = 1; i < prev_path.length; i++) {
        let root = prev_path.slice(0, i)
        let root_length = root.length
        for (var pathInd in listA) {
          let path = listA[pathInd]

          if (arrayEquals(path.slice(0, i), root)) {
            let edgeToIgnore = [path[i - 1], path[i]]
            ignore_edges.push(edgeToIgnore)
          }
        }
        try {
          let sol = shortestPath(
            g,
            root[root.length - 1],
            target,
            (ignore_nodes = ignore_nodes),
            (ignore_edges = ignore_edges),
          )
          let length = sol.dist
          let spur = sol.path
          let path = root.slice(0, root.length - 1).concat(spur)
          listB.push(root_length + length, path)
        } catch (e) {
          //console.log(`yenFromPy error was... ${e}`)
          //dont do anything.
        }
        ignore_nodes.push(root[root.length - 1])
      }
    }
    if (listB.sortedpaths) {
      try {
        let path = listB.pop()
        yield path
        listA.push(path)
        prev_path = path
      } catch (e) {
        break
      }
    } else {
      break
    }
  }
}

function getKShortestPaths(g, source, target, k) {
  let paths = []
  let gen = yenFromPy(g, source, target)
  for (var n = 1; n <= k; n++) {
    try {
      let res = gen.next().value
      if (res && !arrayContains(paths, res)) {
        paths.push(res)
      }
    } catch (e) {
      break
    }
  }
  return paths
}

function getPathsFromPools(pools, inputToken, outputToken) {
  let graph = getGraphFromPoolList(pools)
  return getKShortestPaths(graph, inputToken, outputToken, 1000)
}

// function getAllPathsBelowLengthN(g, source, target, N, limit = 1000) {
//     // use Yen's algorithm to find the paths of length N or below between source and target nodes in graph g.
//     let paths = [];
//     let gen = yenFromPy(g, source, target);
//     let currentPathLength = 0;
//     let count = 1;
//     while (currentPathLength <= N) {
//         try {
//             let res = gen.next().value;
//             if (res && !arrayContains(paths, res)) {
//                 if (res.length > currentPathLength) {
//                     currentPathLength = res.length;
//                     if (currentPathLength > N) {
//                         break;
//                     }
//                 }
//                 paths.push(res);
//             }
//             count = count + 1;
//             if (count > limit) {
//                 break;
//             }
//         } catch (e) {
//             break;
//         }
//     }
//     return paths;
// }

async function getAllPathsBelowLengthN(g, source, target, N, limit = 100) {
  // use Yen's algorithm to find the paths of length N or below between source and target nodes in graph g.
  // console.log("working with graph")
  // console.log(g)
  // console.log(`SOURCE IS ${source}`)
  // console.log(`TARGET IS ${target}`)
  let paths = []
  // console.log('INPUTS TO YENFROMPY:')
  // console.log(g)
  // console.log(source)
  // console.log(target)
  let gen = await yenFromPy(g, source, target)
  let currentPathLength = 0
  let count = 1
  while (currentPathLength <= N) {
    //   console.log(`CURRENT PATH LENGTH IS ${currentPathLength}`)
    try {
      let res = await gen.next().value
      //   console.log(`RES IS ${res}`)
      if (res && !arrayContains(paths, res)) {
        if (res.length > currentPathLength) {
          currentPathLength = res.length
          if (currentPathLength > N) {
            break
          }
        }
        paths.push(res)
      }
      count = count + 1
      if (count > limit) {
        break
      }
    } catch (e) {
      //   console.log(e)
      break
    }
  }
  return paths
}

function getGraphFromPoolList(poolList) {
  let pools = poolList.filter(
    (item) => item.token1Supply != '0' && item.token2Supply != '0',
  )
  let transitions = pools.map((item) => [item.token1Id, item.token2Id])
  let g = {}
  addEdges(g, transitions)
  return g
}

////////////////////////////////////

// TESTS

////////////////////////////////////

// let allocations = [ new Big(33), new Big(33), new Big(33) ];
// let totalInput = new Big(100);
// let res = checkIntegerSumOfAllocations(allocations, totalInput);
// console.log(res);

// check for stableswap.
function stableSmart(inputToken, outputToken, totalInput, slippageTolerance) {
  let stableCoins = [
    'dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near',
    'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
    '6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near',
  ]

  if (stableCoins.includes(inputToken) && stableCoins.includes(outputToken)) {
    //use stable swap only.
    //STABLESWAP(inputToken, outputToken, totalInput, slippageTolerance)
  } else if (
    stableCoins.includes(inputToken) &&
    !stableCoins.includes(outputToken)
  ) {
    // input is stable and output is not.
    // (A) try route inputToken-->stable2-->outputToken (stablePool-->simple pool)
    // (B) try route inputTokne-->stable3-->outputToken (stablePool-->simple pool)
    // (C) try normal smart route. (simple Pool-->simple pool)
    // compare outputs from A,B,C and use the one with maximum return.
  } else if (
    !stableCoins.includes(inputToken) &&
    stableCoins.includes(outputToken)
  ) {
    // input is not stable, output is.
    // (A) try route inputToken-->stable2-->outputToken (simple Pool-->stablepool)
    // (B) try route inputToken-->stable3-->outputToken (simple Pool-->stablepool)
    // (C) try normal smart route. (simple Pool-->simple pool)
    // compare outputs from A,B,C and use the one with maximum return.
  } else {
    //do normal smart route swap. (simple Pool-->simple pool)
  }
}

// let poolList = data.testPools

// console.log(poolList)

// let pools = []
// let poolInds = []
// for (var i = 0; i < poolList.length; i++) {
//   if (!poolInds.includes(poolList[i].id)) {
//     poolInds.push(poolList[i].id)
//     pools.push(poolList[i])
//   }
// }

// let inputToken = 'wrap.near'
// let outputToken = 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'
// ///let outputToken = 'dbio.near'
// let totalInput = new Big('10000000000000000000000')

// let paths = getPathsFromPools(pools, inputToken, outputToken);
// let poolChains = getPoolChainFromPaths(paths, pools);
// let routes = getRoutesFromPoolChain(poolChains)
// let nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains);

// let allocations = getBestOptInput(routes, nodeRoutes, totalInput);
// console.log(allocations.map((item)=>item.toString()))

//let slippageTolerance = 0.001
// getSmartRouteSwapActions(pools, inputToken, outputToken, totalInput, slippageTolerance)

// let smallPools = [
//   {
//     id: 19,
//     token1Id: 'wrap.near',
//     token2Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
//     token1Supply: '458507706848275237144751',
//     token2Supply: '4773827',
//     fee: 20,
//     shares: '1433530386500514261296380',
//     update_time: 1643427419,
//     token0_price: '0',
//     reserves: {
//       'wrap.near': '458507706848275237144751',
//       'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near': '4773827',
//     },
//   },
//   {
//     id: 3,
//     token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
//     token2Id: 'wrap.near',
//     token1Supply: '3261996451',
//     token2Supply: '304306342709289283750201906',
//     fee: 30,
//     shares: '8961777751403231002448648',
//     update_time: 1643427419,
//     token0_price: '0',
//   },
// ]

// let sp = [smallPools[1]]
// let tp = [
//   {
//     id: 3,
//     token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
//     token2Id: 'wrap.near',
//     token1Supply: '3261996451',
//     token2Supply: '304306342709289283750201906',
//     fee: 30,
//     shares: '8961777751403231002448648',
//     update_time: 1643427419,
//     token0_price: '0',
//   },
//   {
//     id: 4,
//     token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
//     token2Id: 'wrap.near',
//     token1Supply: '3261996451',
//     token2Supply: '304306342709289283750201906',
//     fee: 30,
//     shares: '8961777751403231002448648',
//     update_time: 1643427419,
//     token0_price: '0',
//   },
//   {
//     id: 5,
//     token1Id: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
//     token2Id: 'wrap.near',
//     token1Supply: '3261996451',
//     token2Supply: '304306342709289283750201906',
//     fee: 30,
//     shares: '8961777751403231002448648',
//     update_time: 1643427419,
//     token0_price: '0',
//   },
// ]

// console.log(
//   getSmartRouteSwapActions(
//     tp,
//     'wrap.near',
//     'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
//     '1000000000000000000',
//     0.001,
//   ),
// )

// console.log(
//   checkIntegerSumOfAllocations(
//     [
//       new Big('3333333333333333333333'),
//       new Big('3333333333333333333333'),
//       new Big('3333333333333333333333'),
//     ],
//     new Big('10000000000000000000000'),
//   ),
// )
// let sp = smallPools.reverse()

// let paths = getPathsFromPools(sp, inputToken, outputToken)
// let poolChains = getPoolChainFromPaths(paths, sp)
// let routes = getRoutesFromPoolChain(poolChains)
// let nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)

// let allocations = getBestOptInput(routes, nodeRoutes, totalInput)
// console.log(allocations.map((item)=>item.toString()))

// let actions = getActionListFromRoutesAndAllocations(
//   routes,
//   nodeRoutes,
//   allocations,
//   slippageTolerance,
// )

// console.log(actions);

//console.log(distillCommonPoolActions(actions))

// console.log(
//   getSmartRouteSwapActions(
//     sp,
//     inputToken,
//     outputToken,
//     totalInput,
//     slippageTolerance,
//   ),
// )

// [
//     {
//       pool_id: 3,
//       token_in: 'wrap.near',
//       token_out: 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near',
//       amount_in: '10000000000000000000000',
//       min_amount_out: '106763'
//     }
//   ]

module.exports = { getSmartRouteSwapActions }
