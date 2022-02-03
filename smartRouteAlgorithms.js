const { default: Big } = require('big.js');
Big.DP = 40
Big.NE = -40
Big.PE = 40
// Is any configuration needed to do floor or enforce the number of decimal places?

function getBetaForRoute(route, path) {
    if (!route.length) {route = [route]};
    if (route.length == 1) {
        let p = route[0];
        var beta = new Big(p.reserves[path[0]]);
    } else if (route.length == 2) {
        let p1 = route[0];
        let p2 = route[1];
        var beta = new Big(p1.reserves[path[0]]).times(new Big(p2.reserves[path[1]]));
    }
    return beta;
}

function getEpsilonForRoute(route, path) {
    if (!route.length) {route = [route]};
    if (route.length == 1) {
        // Single Hop case
        let p = route[0];
        let gamma = new Big(10000).minus(new Big(p.fee)).div(new Big(10000));
        var epsilon = Big(gamma);
    } else if (route.length == 2) {
        //Double Hop Case
        let p1 = route[0];
        let p2 = route[1];
        let gamma1 = new Big(10000).minus(new Big(p1.fee)).div(new Big(10000));
        let gamma2 = new Big(10000).minus(new Big(p2.fee)).div(Big(10000));
        var epsilon = new Big(p2.reserves[path[1]])
            .times(new Big(gamma1))
            .plus(new Big(p1.reserves[path[1]]).times(gamma1).times(gamma2));
    }
    return epsilon;
}

function getAlphaForRoute(route, path) {
    if (!route.length) {route = [route]}
    if (route.length == 1) {
        //console.log('single hop')
        let p = route[0];
        let inputToken = path[0];
        let outputToken = path[1];
        let gamma = new Big(10000).minus(new Big(p.fee)).div(new Big(10000));
        let key1 = p.token1Id;
        let key2 = p.token2Id;
        let val1 = p.token1Supply;
        let val2 = p.token2Supply;
        p['reserves'] = {[key1]:val1, [key2]:val2};
        var alpha = new Big(p.reserves[inputToken]).times(new Big(p.reserves[outputToken]).times(new Big(gamma)));
    } else if (route.length == 2) {
        //console.log('double hop')
        let p1 = route[0];
        let p2 = route[1];
        let key11 = p1.token1Id;
        let key12 = p1.token2Id;
        let val11 = p1.token1Supply;
        let val12 = p1.token2Supply;
        p1['reserves'] = {[key11]:val11, [key12]:val12};
        let key21 = p2.token1Id;
        let key22 = p2.token2Id;
        let val21 = p2.token1Supply;
        let val22 = p2.token2Supply;
        p2['reserves'] = {[key21]:val21, [key22]:val22};
        let inputToken = path[0];
        let middleToken = path[1];
        let outputToken = path[2];
        let gamma1 = new Big(10000).minus(Big(p1.fee)).div(new Big(10000));
        let gamma2 = new Big(10000).minus(new Big(p2.fee)).div(new Big(10000));
        let alpha1 = new Big(p1.reserves[inputToken]).times(new Big(p1.reserves[middleToken])).times(gamma1);
        let alpha2 = new Big(p2.reserves[middleToken]).times(new Big(p2.reserves[outputToken])).times(gamma2);
        var alpha = alpha1.times(alpha2);
    }
    return alpha;
}

function getAlphaSumFromRoutes(routes, nodeRoutes) {
    let alphaSum = new Big(0);
    for (var i in routes) {
        let route = routes[i];
        let nodeRoute = nodeRoutes[i];
        let alpha = getAlphaForRoute(route,nodeRoute);
        let radical = new Big(alpha).sqrt();
        let epsilon = getEpsilonForRoute(route,nodeRoute);
        let denom = new Big(epsilon);
        alphaSum = alphaSum.plus(radical.div(denom));
    }
    return alphaSum;
}

function getBetaSumFromRoutes(routes, nodeRoutes) {
    let betaSum = new Big(0);
    for (var i in routes) {
        let route = routes[i];
        let nodeRoute = nodeRoutes[i];
        let num = new Big(getBetaForRoute(route, nodeRoute));
        let denom = new Big(getEpsilonForRoute(route, nodeRoute));
        betaSum = betaSum.plus(num.div(denom));
    }
    return betaSum;
}

function getPhiFromRoutes(routes, nodeRoutes, totalInput) {
    let alphaSum = getAlphaSumFromRoutes(routes, nodeRoutes);
    let betaSum = getBetaSumFromRoutes(routes, nodeRoutes);
    // console.log('ALPHASUM IS ...')
    // console.log(alphaSum.toString())
    // console.log('BETASUM IS...')
    // console.log(betaSum.toString())
    // console.log('FOR ROUTES...')
    // console.log(routes)
    let phi = new Big(totalInput).plus(betaSum).div(alphaSum);
    return phi;
}

function getAllocationForRoute(phi, route, path) {
    let alpha = getAlphaForRoute(route, path);
    let beta = getBetaForRoute(route, path);
    let epsilon = getEpsilonForRoute(route, path);
    let allocation = new Big(phi).abs().times(new Big(alpha).sqrt()).minus(beta).div(epsilon);
    return allocation;
}

function getAllocationVectorForRoutes(phi, routes, nodeRoutes) {
    let allocationVec = [];
    for (var i in routes) {
        allocationVec.push(getAllocationForRoute(phi, routes[i], nodeRoutes[i]));
    }
    return allocationVec;
}

function getOptimalAllocationForRoutes(routes, nodeRoutes, totalInput) {
    console.log("CALLING GET OPTIMAL ALLOCATION FOR ROUTES:")
    // console.log(routes)
    var totalInput = new Big(totalInput);
    let phi = getPhiFromRoutes(routes, nodeRoutes, totalInput);
    console.log('PHI CALCULATED TO BE...')
    console.log(phi.toString())
    let allocations = getAllocationVectorForRoutes(phi, routes, nodeRoutes);
    if (allocations.every((item)=>item.lt(new Big(0)))) {console.log('all allocations were negative...'); allocations = allocations.map((item)=>item.times(new Big(-1.0)))}
    if (allocations.some((item) => item.lt(new Big(0)))) {
        allocations = reduceRoutes(routes, nodeRoutes, allocations, totalInput);
    }
    let sumAllocations = allocations.reduce((a, b) => a.plus(b), new Big(0));
    let normalizedAllocations = allocations.map((a) => a.div(sumAllocations).times(new Big(totalInput)));
    return normalizedAllocations;
}

function reduceRoutes(routes, nodeRoutes, allocationVec, totalInput) {
    console.log("RUNNING REDUCE ROUTES")
    var totalInput = new Big(totalInput);
    let goodIndices = [];
    for (var i in allocationVec) {
        let dx = allocationVec[i];
        // console.log('DX IS...')
        // console.log(dx.toString())
        if (dx.gt(new Big(0))) {
            goodIndices.push(i);
        }
    }
    console.log('GOOD INDICES ARE...')
    console.log(goodIndices)
    let newRoutes = [];
    let newNodeRoutes = [];
    for (var i in goodIndices) {
        let goodIndex = goodIndices[i];
        newRoutes.push(routes[goodIndex]);
        newNodeRoutes.push(nodeRoutes[goodIndex]);
    }
    allocationVec = getOptimalAllocationForRoutes(newRoutes, newNodeRoutes, totalInput);
    let allocationDict = {};
    for (var i in goodIndices) {
        allocationDict[goodIndices[i]] = allocationVec[i];
    }
    var allocationVecNew = [];
    for (var i in routes) {
        if (goodIndices.includes(i)) {
            allocationVecNew.push(allocationDict[i]);
        } else {
            let zeroAllocation = new Big(0);
            allocationVecNew.push(zeroAllocation);
        }
    }
    return allocationVecNew;
}

function getNodeRoutesFromPathsAndPoolChains(paths, poolChains) {
    let multiplicity = [];
    for (var i in poolChains) {
        let pc = poolChains[i];
        let mul = pc.map((item) => item.length).reduce((elem1, elem2) => elem1 * elem2, 1);
        multiplicity.push(mul);
    }
    let nodeRoutes = [];
    for (var j in paths) {
        let path = paths[j];
        let m = multiplicity[j];
        for (var k = 0; k < m; k++) {
            nodeRoutes.push(path);
        }
    }
    return nodeRoutes;
}

function getPoolChainFromPaths(paths, pools, threshold = 0.001) {
    let poolChains = [];
    for (var pathInd in paths) {
        let path = paths[pathInd];
        let chain = [];
        let pairs = [];
        for (var i = 0; i < path.length - 1; i++) {
            pairs.push([ path[i], path[i + 1] ]);
        }
        for (var pairInd in pairs) {
            let pair = pairs[pairInd];
            let tokenPools = getPoolsByToken1ANDToken2(pools, pair[0], pair[1]);
            chain.push(tokenPools);
        }
        poolChains.push(chain);
    }
    // return poolChains;
    let culledPoolChains = getCulledPoolChains(poolChains, 0)
    return culledPoolChains;
}

function getCulledPoolChains(poolChains, threshold = 0.001) {
    let newChains = [];
    for (var pathInd in poolChains) {
        let path = poolChains[pathInd];
        let newPath = [];
        for (var legInd in path) {
            let leg = path[legInd];
            let culledPath = cullPoolsWithInsufficientLiquidity(leg, threshold);
            newPath.push(culledPath);
        }
        newChains.push(newPath);
    }
    return newChains;
}

function getRoutesFromPoolChain(poolChains) {
    let routes = [];
    for (var pci in poolChains) {
        let poolChain = poolChains[pci];
        //get cartesian product of each pool chain to get the list of routes.
        let newRoutes = cartesianProduct(poolChain);
        routes.push(...newRoutes);
    }
    return routes;
}

function getOutputSingleHop(pool, inputToken, outputToken, totalInput) {
    var totalInput = new Big(totalInput);
    // check if pool is forward or backward for inputToken/outputToken cf. token1Id/token2Id
    if (inputToken === pool.token1Id && outputToken === pool.token2Id) {
        // forward Pool
        var reserves = {
            [inputToken]: new Big(pool.token1Supply),
            [outputToken]: new Big(pool.token2Supply)
        };
    } else if (inputToken === pool.token2Id && outputToken === pool.token1Id) {
        // reverse pool
        var reserves = {
            [outputToken]: new Big(pool.token1Supply),
            [inputToken]: new Big(pool.token2Supply)
        };
    } else {
        //got the wrong pool.
        console.log(
            `INPUT TOKENS ${inputToken} and ${outputToken} DO NOT EXIST IN THIS POOL, which contains ${pool.token1Id} and ${pool.token2Id}`
        );
        return new Big(0);
    }
    let gamma = new Big(10000).minus(new Big(pool.fee)).div(new Big(10000));
    // console.log(totalInput)
    // console.log(gamma)
    // console.log(reserves)
    let num = totalInput.times(gamma).times(reserves[outputToken]);
    let denom = reserves[inputToken].plus(gamma.times(totalInput));
    return num.div(denom);
}

function getOutputDoubleHop(pools, inputToken, middleToken, outputToken, totalInput) {
    var totalInput = new Big(totalInput);
    for (var poolIndex in pools) {
        let p = pools[poolIndex];
        p['gamma'] = new Big(10000).minus(new Big(p.fee)).div(new Big(10000));
    }
    let p1 = pools[0];
    let p2 = pools[1];

    if (inputToken === p1.token1Id && middleToken === p1.token2Id) {
        // forward Pool
        p1['reserves'] = {
            inputToken: new Big(p1.token1Supply),
            middleToken: new Big(p1.token2Supply)
        };
    } else if (middleToken === p1.token1Id && inputToken === p1.token2Id) {
        //reverse pool
        p1['reserves'] = {
            middleToken: new Big(p1.token1Supply),
            inputToken: new Big(p1.token2Supply)
        };
    }

    if (middleToken === p2.token1Id && outputToken === p2.token2Id) {
        // forward Pool
        p2['reserves'] = {
            middleToken: new Big(p2.token1Supply),
            outputToken: new Big(p2.token2Supply)
        };
    } else if (outputToken === p2.token1Id && middleToken === p2.token2Id) {
        //reverse pool
        p2['reserves'] = {
            outputToken: new Big(p2.token1Supply),
            middleToken: new Big(p2.token2Supply)
        };
    }

    let c1 = new Big(p1.reserves.middleToken);
    let a1 = new Big(p1.reserves.inputToken);
    let c2 = new Big(p2.reserves.middleToken);
    let b2 = new Big(p2.reserves.outputToken);
    let gamma1 = p1.gamma;
    let gamma2 = p2.gamma;
    let num = totalInput.times(c1).times(b2).times(gamma1).times(gamma2);
    let denom = c2.times(a1).plus(totalInput.times(c2.times(gamma1).plus(c1.times(gamma1).times(gamma2))));
    // denom = c2*a1 + totalInput * (c2*gamma1 + c1*gamma1*gamma2)

    return num.div(denom);
}

function getOutputFromRoute(route, nodeRoute, allocation) {
    if (new Big(allocation).eq(new Big(0))) {
        return new Big(0);
    } else {
        var allocation = new Big(allocation);
    }
    if (!route.length) {route = [route]};
    if (route.length == 1) {
        // single hop
        let inputToken = nodeRoute[0];
        let outputToken = nodeRoute[1];
        let pool = route[0];
        var output = getOutputSingleHop(pool, inputToken, outputToken, allocation);
    } else if (route.length == 2) {
        // DOUBLE HOP
        let inputToken = nodeRoute[0];
        let middleToken = nodeRoute[1];
        let outputToken = nodeRoute[2];
        let pools = route;
        var output = getOutputDoubleHop(pools, inputToken, middleToken, outputToken, allocation);
    }
    return output;
}

function getOptOutputVec(routes, nodeRoutes, totalInput) {
    let allocations = getOptimalAllocationForRoutes(routes, nodeRoutes, totalInput);
    let result = [];
    for (var i in routes) {
        let route = routes[i];
        let nodeRoute = nodeRoutes[i];
        let allocation = allocations[i];
        let output = getOutputFromRoute(route, nodeRoute, allocation);
        result.push(output);
    }
    return {
        result: result,
        allocations: allocations
    };
    //NOTE -- I made this return an object instead of the tuple returned in python. need to check the places it is called, and specify
    // result field instead of tuple 0 position, and allocations field instead of tuple 1 position.
}

function getBestOptOutput(routes, nodeRoutes, totalInput) {
    let outputRefined = getOptOutputVecRefined(routes, nodeRoutes, totalInput).result;
    let outputRaw = getOptOutputVec(routes, nodeRoutes, totalInput).result;
    let res1 = new Big(0);
    let res2 = new Big(0);

    for (var n in outputRefined) {
        res1 = res1.plus(outputRefined[n]);
    }
    for (var nn in outputRaw) {
        res2 = res2.plus(outputRaw[nn]);
    }
    if (res1.gt(res2)) {
        return res1;
    } else {
        return res2;
    }
}

function getBestOptInput(routes, nodeRoutes, totalInput) {
    let refDict = getOptOutputVecRefined(routes, nodeRoutes, totalInput);
    let outputRefined = refDict.result;
    let inputRefined = refDict.allocations;
    let rawDict = getOptOutputVec(routes, nodeRoutes, totalInput);
    let outputRaw = rawDict.result;
    let inputRaw = rawDict.allocations;
    let res1 = new Big(0);
    let res2 = new Big(0);

    for (var n in outputRefined) {
        res1 = res1.plus(outputRefined[n]);
    }
    for (var nn in outputRaw) {
        res2 = res2.plus(outputRaw[nn]);
    }
    console.log('COMPARING SINGLE HOPS VS DOUBLE')
    console.log(res1.toString())
    console.log(res2.toString())
    if (res1.gt(res2)) {
        return inputRefined;
    } else {
        return inputRaw;
    }
}

function getOptOutputVecRefined(routes, nodeRoutes, totalInput) {
    let initLengthRoutes = routes.length;
    let directRouteInds = [];
    for (var routeInd in routes) {
        let route = routes[routeInd];
        if (!route.length) {route = [route]}
        if (route.length == 1) {
            directRouteInds.push(routeInd);
        }
    }
    console.log('DIRECT ROUTE INDS ARE')
    console.log(directRouteInds)
    if (directRouteInds.length < 1) {
        var allocations = getOptimalAllocationForRoutes(routes, nodeRoutes, totalInput);
        var result = [];
        for (var i in routes) {
            let r = routes[i];
            let nr = nodeRoutes[i];
            let a = allocations[i];
            let output = getOutputFromRoute(r, nr, a);
            result.push(output);
        }
    } else {
        // console.log('DOING SINGLE HOP ONLY')
        let droutes = [];
        let dnodeRoutes = [];
        for (var dri in directRouteInds) {
            let ind = directRouteInds[dri];
            droutes.push(routes[ind]);
            dnodeRoutes.push(nodeRoutes[ind]);
        }
        let dallocations = getOptimalAllocationForRoutes(droutes, dnodeRoutes, totalInput);
        let dallocDict = {};
        for (var dd in dallocations) {
            dallocDict[directRouteInds[dd]] = dallocations[dd];
        }
        var allocations = [];
        
        for (var ii = 0; ii < initLengthRoutes; ii++) {
            if (directRouteInds.includes(ii.toString())) {
                //console.log('ADDING ALLOCATION FOR SINGLE ROUTE')
                allocations.push(dallocDict[ii]);
            } else {

                allocations.push(new Big(0));
            }
        }
        var result = [];
        for (var j in routes) {
            let route = routes[j];
            let nodeRoute = nodeRoutes[j];
            let allocation = allocations[j];
            let output = getOutputFromRoute(route, nodeRoute, allocation);
            result.push(output);
    }
   
    }
    return {
        result: result,
        allocations: allocations
    };
}

function getBestOptimalAllocationsAndOutputs(pools, inputToken, outputToken, totalInput) {
    var totalInput = new Big(totalInput);
    let paths = getPathsFromPools(pools, inputToken, outputToken);
    let poolChains = getPoolChainFromPaths(paths, pools);
    let routes = getRoutesFromPoolChain(poolChains);
    let nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains);
    let allocations = getBestOptInput(routes, nodeRoutes, totalInput);
    let outputs = getBestOptOutput(routes, nodeRoutes, totalInput);
    return {
        allocations: allocations,
        outputs: outputs,
        routes: routes,
        nodeRoutes: nodeRoutes
    };
}

function getActionListFromRoutesAndAllocations(routes, nodeRoutes, allocations, slippageTolerance) {
    // TODO: need to add in minimumAmountOut for each action instead of a hop Multiplier
    // TODO: need to consolidate sub-parallel swap paths - need middle token checks.
    let actions = [];
    for (var i in routes) {
        let route = routes[i];
        let nodeRoute = nodeRoutes[i];
        let allocation = allocations[i];
        if (allocation.eq(new Big(0))) {
            continue;
        }
        if (!route.length) {route = [route]}
        if (route.length === 1) {
            //single hop. only one action.
            let pool = route[0];
            let poolId = pool.id;
            let inputToken = nodeRoute[0];
            let outputToken = nodeRoute[1];
            let expectedAmountOut = getOutputSingleHop(pool, inputToken, outputToken, allocation);
            let minimumAmountOut = expectedAmountOut.times(new Big(1).minus(slippageTolerance)).round().toString(); //Here, assume slippage tolerance is a fraction. So 1% would be 0.01
            let action = {
                pool_id: poolId,
                token_in: inputToken,
                token_out: outputToken,
                amount_in: allocation.round().toString(),
                min_amount_out: minimumAmountOut.toString()
            };
            actions.push(action);
        } else if (route.length === 2) {
            // double hop. two actions.
            let pool1 = route[0];
            let pool2 = route[1];
            let pool1Id = pool1.id;
            let pool2Id = pool2.id;
            let inputToken = nodeRoute[0];
            let middleToken = nodeRoute[1];
            let outputToken = nodeRoute[2];
            let expectedAmountOutFirstHop = getOutputSingleHop(pool1, inputToken, middleToken, allocation);
            let minimumAmountOutFirstHop = expectedAmountOutFirstHop
                .times(new Big(1).minus(slippageTolerance))
                .round()
                .toString(); //Here, assume slippage tolerance is a fraction. So 1% would be 0.01

            let action1 = {
                pool_id: pool1Id,
                token_in: inputToken,
                token_out: middleToken,
                amount_in: allocation.round().toString(),
                min_amount_out: minimumAmountOutFirstHop
            };
            let expectedFinalAmountOut = getOutputSingleHop(pool2, middleToken, outputToken, minimumAmountOutFirstHop);
            let minimumAMountOutSecondHop = expectedFinalAmountOut
                .times(new Big(1).minus(slippageTolerance))
                .round()
                .toString();
            let action2 = {
                pool_id: pool2Id,
                token_in: middleToken,
                token_out: outputToken,
                amount_in: minimumAmountOutFirstHop,
                min_amount_out: minimumAMountOutSecondHop
            };
            actions.push(action1);
            actions.push(action2);
        }
    }
    return actions;
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

function getSmartRouteSwapActions(pools, inputToken, outputToken, totalInput, slippageTolerance) {
    if (!totalInput) {
        return [];
    }
    var totalInput = new Big(totalInput);
    let resDict = getBestOptimalAllocationsAndOutputs(pools, inputToken, outputToken, totalInput);
    let allocations = resDict.allocations;
    let outputs = resDict.outputs;
    let routes = resDict.routes;
    let nodeRoutes = resDict.nodeRoutes;
    let actions = getActionListFromRoutesAndAllocations(routes, nodeRoutes, allocations, slippageTolerance);
    //     #Note, if there are multiple transactions for a single pool, it might lead to sub-optimal
    //     #returns. This is due to the fact that the routes are treated as independent, where
    //     #here, if one transaction goes through in a pool, it changes the price of the asset
    //     #before the second transaction can occur.

    //     #combine same-pool transactions into single transaction:
    let poolsUsedPerAction = actions.map((item) => item.pool_id);
    let axnSet = [];
    let repeats = false;
    for (var i in poolsUsedPerAction) {
        if (axnSet.includes(poolsUsedPerAction[i])) {
            repeats = true;
            break;
        } else {
            axnSet.push(poolsUsedPerAction[i]);
        }
    }
    if (repeats) {
        var pid = {};
        for (var ai in actions) {
            let a = actions[ai];
            let currentPoolId = a.pool_id;
            if (Object.keys(pid).includes(currentPoolId)) {
                pid.currentPoolId.push(a);
            } else {
                pid[currentPoolId] = [ a ];
            }
        }
        var newActions = [];
        var poolIds = Object.keys(pid);
        for (var pi in poolIds) {
            let poolId = poolIds[pi];
            let actionList = pid[poolId];
            console.log(actionList)
            if (actionList.length==1) {
                var poolTotalInput = new Big(actionList[0].amount_in)
            } else {var poolTotalInput = actionList.reduce((a, b) => new Big(a.amount_in) + new Big(b.amount_in), new Big(0));}
            
            let inputToken = actionList[0].token_in;
            let outputToken = actionList[0].token_out;
            let pool = pools.filter((item) => item.id.toString() === poolId)[0];
            let expectedMinimumOutput = getOutputSingleHop(pool, inputToken, outputToken, poolTotalInput).times(
                (new Big(1).minus(new Big(slippageTolerance)))
            );
            let newAction = {
                pool_id: poolId,
                token_in: inputToken,
                token_out: outputToken,
                amount_in: poolTotalInput.round().toString(),
                min_amount_out: expectedMinimumOutput.round().toString()
            };
            newActions.push(newAction);
        }
    }
    return newActions;
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
            item.token1Id === token1 || item.token2Id === token1 || item.token1Id === token2 || item.token2Id === token2
    );
    return filteredPools;
}

function getPoolsByToken1ANDToken2(pools, token1, token2) {
    let filteredPools = pools.filter(
        (item) =>
            (item.token1Id === token1 && item.token2Id === token2) ||
            (item.token1Id === token2 && item.token2Id === token1)
    );
    return filteredPools;
}

function getLiqudityOfPoolsFromList(pools) {
    let liquidities = [];
    for (var poolInd in pools) {
        let pool = pools[poolInd];
        pool.amounts = [pool.token1Supply,pool.token2Supply];
        let poolBigAmounts = pool.amounts.map((item) => new Big(item));
        let liquidity = poolBigAmounts[0].times(poolBigAmounts[1]);
        liquidities.push(liquidity);
    }
    return liquidities;
}

function getNormalizedLiquiditiesFromList(pools) {
    let liquidities = getLiqudityOfPoolsFromList(pools);
    let maxLiq = bigMax(liquidities);
    let normalizedLiquidities = liquidities.map((item) => item.div(maxLiq));
    return normalizedLiquidities;
}

function bigMax(arrayOfBigs) {
    if (arrayOfBigs.length < 1) {
        return null;
    }
    let maxElem = arrayOfBigs[0];
    for (var ind in arrayOfBigs) {
        let val = arrayOfBigs[ind];
        if (val.gt(maxElem)) {
            maxElem = val;
        }
    }
    return maxElem;
}

function cullPoolsWithInsufficientLiquidity(pools, threshold = 0.001) {
    var thresh = new Big(threshold);
    let normLiq = getNormalizedLiquiditiesFromList(pools);
    filteredPools = [];
    for (var i = 0; i < normLiq.length; i++) {
        if (normLiq[i] > thresh) {
            filteredPools.push(pools[i]);
        }
    }
    return filteredPools;
}

function cartesianProduct(a) {
    let result = a.reduce((a, b) => a.flatMap((d) => b.map((e) => [ d, e ].flat())));
    return result;
}

function checkIntegerSumOfAllocations(allocations, totalInput) {
    var totalInput = new Big(totalInput);
    let alloSum = allocations.map((item) => new Big(item)).reduce((a, b) => a.plus(b), new Big(0));
    let offset = totalInput.minus(alloSum);
    //get largest allocation.
    let currMax = new Big(0);
    let currMaxInd = 0;
    for (var i in allocations) {
        if (allocations[i].gt(currMax)) {
            currMaxInd = i;
            currMax = allocations[i];
        }
    }
    let newAllocations = [];
    for (var j in allocations) {
        if (j === currMaxInd) {
            newAllocations.push(allocations[j].plus(offset).toString());
        } else {
            newAllocations.push(allocations[j].toString());
        }
    }
    return newAllocations;
}

function addEdge(g, edge) {
    let src = edge[0];
    let dst = edge[1];
    if (Object.keys(g).includes(src)) {
        if (!Object.keys(g[src]).includes(dst)) {
            g[src][dst] = 1;
        }
    } else {
        g[src] = {};
        g[src][dst] = 1;
    }
    if (Object.keys(g).includes(dst)) {
        if (!Object.keys(g[dst]).includes(src)) {
            g[dst][src] = 1;
        }
    } else {
        g[dst] = {};
        g[dst][src] = 1;
    }
}

function addEdges(g, edgeList) {
    for (var n in edgeList) {
        let edge = edgeList[n];
        //console.log(edge);
        addEdge(g, edge);
    }
}

function deleteEdge(g, edge) {
    let gNew = JSON.parse(JSON.stringify(g)); // using this to deep clone graph structure
    let e1 = edge[0];
    let e2 = edge[1];
    if (Object.keys(gNew).includes(e1)) {
        if (Object.keys(gNew[e1]).includes(e2)) {
            delete gNew[e1][e2];
        }
    }
    if (Object.keys(gNew).includes(e2)) {
        if (Object.keys(gNew[e2]).includes(e1)) {
            delete gNew[e2][e1];
        }
    }
    return gNew;
}

function deleteNode(g, node) {
    let gNew = JSON.parse(JSON.stringify(g)); // using this to deep clone graph structure
    if (Object.keys(gNew).includes(node)) {
        delete gNew[node];
    }
    let keys = Object.keys(gNew);
    for (var nodeInd in keys) {
        let nodeNow = keys[nodeInd];
        if (Object.keys(gNew[nodeNow]).includes(node)) {
            delete gNew[nodeNow][node];
        }
    }
    return gNew;
}

function dijkstra(graph, s) {
    var solutions = {};
    solutions[s] = {};
    solutions[s].path = [];
    solutions[s].dist = 0;

    while (true) {
        var parent = null;
        var nearest = null;
        var dist = Infinity;

        //for each existing solution
        for (var n in solutions) {
            if (!solutions[n]) {
                solutions[n] = {};
            }
            if (!solutions[n].path) continue;
            var ndist = solutions[n].dist;
            var adj = graph[n];
            //for each of its adjacent nodes...
            for (var a in adj) {
                //without a solution already...
                if (!solutions[a]) {
                    solutions[a] = {};
                }
                if (solutions[a].path) continue;
                //choose nearest node with lowest *total* cost
                var d = adj[a] + ndist;
                if (d < dist) {
                    //reference parent
                    parent = solutions[n].path;
                    nearest = a;
                    dist = d;
                }
            }
        }

        //no more solutions
        if (dist === Infinity) {
            break;
        }

        //extend parent's solution path
        solutions[nearest].path = parent.concat(nearest);
        //extend parent's cost
        solutions[nearest].dist = dist;
    }

    return solutions;
}

function shortestPath(g, src, dst, ignore_nodes = [], ignore_edges = []) {
    let gTemp = JSON.parse(JSON.stringify(g)); // using this to deep clone graph structure. If we can use lodash, could use  _.cloneDeep(obj)
    // remove nodes
    for (var nodeInd in ignore_nodes) {
        let nodeNow = ignore_nodes[nodeInd];
        gTemp = deleteNode(gTemp, nodeNow);
    }
    // remove edges
    for (var edgeInd in ignore_edges) {
        let edgeNow = ignore_edges[edgeInd];
        gTemp = deleteEdge(gTemp, edgeNow);
    }
    let solution = dijkstra(gTemp, src)[dst];
    solution.path.unshift(src); // original algorithm doesn't include source node in path
    return solution;
}

function* count(firstval = 0, step = 1) {
    let x = firstval;
    while (true) {
        yield x;
        x = x + 1;
    }
}


class PathBuffer {
  constructor() {
      this.paths = [];
      this.sortedpaths = [];
      //this.counter = count();
  }
  len() {
      return this.sortedpaths.length;
  }

  push(cost, path) {
      if (path && !arrayContains(this.paths, path)) {
          this.sortedpaths.push([ cost, path ]);
          this.sortedpaths.sort(function(a, b) {
              return a[0] - b[0];
          });
          //heappush(this.sortedpaths, (cost, this.counter.next().value,path));
          this.paths.push(path);
      }
  }

  pop() {
      //let val = heappop(this.sortedpaths);
      let val = this.sortedpaths.shift();
      let cost = val[0];
      let path = val[1];
      this.paths.splice(this.paths.indexOf(path), 1);
      return path;
  }
}

function arrayEquals(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((val, index) => val === b[index]);
}

function arrayContains(arr, obj) {
  // checks to see if the input array contains a reference object, obj, using
  // JSON.stringify() .
  let obj_json = JSON.stringify(obj);
  for (itemInd in arr) {
      if (JSON.stringify(arr[itemInd]) == obj_json) {
          return true;
      }
  }
  return false;
}

function* yenFromPy(g, source, target) {
  //adapted from the python implementation in networkx.algorithms.simple_paths.shortest_simple_paths()
  let listA = [];
  let listB = new PathBuffer();
  let prev_path = null;

  while (true) {
      if (!prev_path) {
          let sol = shortestPath(g, source, target);
        //   console.log(`SOL IN YEN IS`) 
        //   console.log(sol)
          let length = sol.dist;
          let path = sol.path;
        //   console.log('length is')
        //   console.log(length)
        //   console.log('path is...')
        //   console.log(path)
        //   console.log(listB);
          listB.push(length, path);
        //   console.log(listB)
      } else {
          let ignore_nodes = [];
          let ignore_edges = [];
          for (var i = 1; i < prev_path.length; i++) {
              let root = prev_path.slice(0, i);
              let root_length = root.length;
              for (var pathInd in listA) {
                  let path = listA[pathInd];

                  if (arrayEquals(path.slice(0, i), root)) {
                      let edgeToIgnore = [ path[i - 1], path[i] ];
                      ignore_edges.push(edgeToIgnore);
                  }
              }
              try {
                  let sol = shortestPath(
                      g,
                      root[root.length - 1],
                      target,
                      (ignore_nodes = ignore_nodes),
                      (ignore_edges = ignore_edges)
                  );
                  let length = sol.dist;
                  let spur = sol.path;
                  let path = root.slice(0, root.length - 1).concat(spur);
                  listB.push(root_length + length, path);
              } catch (e) {
                  //console.log(`yenFromPy error was... ${e}`)
                  //dont do anything.
              }
              ignore_nodes.push(root[root.length - 1]);
          }
      }
      if (listB.sortedpaths) {
          try {
              let path = listB.pop();
              yield path;
              listA.push(path);
              prev_path = path;
          } catch (e) {
              break;
          }
      } else {
          break;
      }
  }
}


function getKShortestPaths(g, source, target, k) {
    let paths = [];
    let gen = yenFromPy(g, source, target);
    for (var n = 1; n <= k; n++) {
        try {
            let res = gen.next().value;
            if (res && !arrayContains(paths, res)) {
                paths.push(res);
            }
        } catch (e) {
            break;
        }
    }
    return paths;
}

function getPathsFromPools(pools, inputToken, outputToken) {
    let graph = getGraphFromPoolList(pools);
    return getKShortestPaths(graph, inputToken, outputToken, 1000);
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
  let paths = [];
  // console.log('INPUTS TO YENFROMPY:')
  // console.log(g)
  // console.log(source)
  // console.log(target)
  let gen = await yenFromPy(g, source, target);
  let currentPathLength = 0;
  let count = 1;
  while (currentPathLength <= N) {
    //   console.log(`CURRENT PATH LENGTH IS ${currentPathLength}`)
      try {
          let res = await gen.next().value;
        //   console.log(`RES IS ${res}`)
          if (res && !arrayContains(paths, res)) {
              if (res.length > currentPathLength) {
                  currentPathLength = res.length;
                  if (currentPathLength > N) {
                      break;
                  }
              }
              paths.push(res);
            }
          count = count + 1;
          if (count > limit) {
              break;
          }
      } catch (e) {
        //   console.log(e)
          break;
      }
  }
  return paths;
}


function getGraphFromPoolList(poolList) {
  let pools = poolList.filter((item)=>item.token1Supply!="0"&&item.token2Supply!="0");
  let transitions = pools.map((item)=>[item.token1Id,item.token2Id]);
  let g = {};
  addEdges(g,transitions);
  return g;

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
        '6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near'
    ];

    if (stableCoins.includes(inputToken) && stableCoins.includes(outputToken)) {
        //use stable swap only.
        //STABLESWAP(inputToken, outputToken, totalInput)
    } else if (stableCoins.includes(inputToken) && !stableCoins.includes(outputToken)) {
        // input is stable and output is not.
        // (A) try route inputToken-->stable2-->outputToken (stablePool-->simple pool)
        // (B) try route inputTokne-->stable3-->outputToken (stablePool-->simple pool)
        // (C) try normal smart route. (simple Pool-->simple pool)
        // compare outputs from A,B,C and use the one with maximum return.
    } else if (!stableCoins.includes(inputToken) && stableCoins.includes(outputToken)) {
        // input is not stable, output is.
        // (A) try route inputToken-->stable2-->outputToken (simple Pool-->stablepool)
        // (B) try route inputToken-->stable3-->outputToken (simple Pool-->stablepool)
        // (C) try normal smart route. (simple Pool-->simple pool)
        // compare outputs from A,B,C and use the one with maximum return.
    } else {
        //do normal smart route swap. (simple Pool-->simple pool)
    }
}

let poolList = [
    {
        "id": 19,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "458507706848275237144751",
        "token2Supply": "4773827",
        "fee": 20,
        "shares": "1433530386500514261296380",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 21,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "9548065530014205174033500",
        "token2Supply": "39402673125783132022",
        "fee": 20,
        "shares": "10553395918663818007668805",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 22,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "559948932527232763126161061",
        "token2Supply": "5828523062826667891572750142444",
        "fee": 40,
        "shares": "14704037557886631027331749173",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 23,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "19326141345328988446041",
        "token2Supply": "208880",
        "fee": 40,
        "shares": "22183810363796001239225907",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 26,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 27,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 28,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 100,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 36,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 37,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 46,
        "token1Id": "wrap.near",
        "token2Id": "mbga.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 48,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "44699365478223043444946531",
        "token2Supply": "182655875065500646258",
        "fee": 20,
        "shares": "1004018688705293680507337",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 50,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "9946064894551748197158",
        "token2Supply": "2020715137881036",
        "fee": 40,
        "shares": "201431211626656831038295",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 52,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 54,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 55,
        "token1Id": "wrap.near",
        "token2Id": "berryclub.ek.near",
        "token1Supply": "10780184817772675979482",
        "token2Supply": "3984027236708604132",
        "fee": 20,
        "shares": "111252592160778949820304",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 56,
        "token1Id": "wrap.near",
        "token2Id": "asc.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 59,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 60,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 66,
        "token1Id": "wrap.near",
        "token2Id": "hongdou.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 70,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 73,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "1308774740016608130784154",
        "token2Supply": "13266763199964147539",
        "fee": 20,
        "shares": "1225954813487176406919168",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 76,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 80,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "168515953412635588747094",
        "token2Supply": "773430481755064852",
        "fee": 40,
        "shares": "184084638308959847117990",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 83,
        "token1Id": "wrap.near",
        "token2Id": "flct.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 86,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 87,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "151058944115624156142",
        "token2Supply": "467233000720951",
        "fee": 20,
        "shares": "338750703639458305707",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 94,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 96,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 98,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 100,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 103,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 107,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 111,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 112,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 113,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 114,
        "token1Id": "wrap.near",
        "token2Id": "berryclub.ek.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 115,
        "token1Id": "wrap.near",
        "token2Id": "berryclub.ek.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 116,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 118,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 119,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 121,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 122,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 123,
        "token1Id": "wrap.near",
        "token2Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 125,
        "token1Id": "wrap.near",
        "token2Id": "padthai.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 128,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 138,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 139,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 140,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 147,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1900,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 149,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 150,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 151,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 152,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 155,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 156,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 157,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 158,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 159,
        "token1Id": "wrap.near",
        "token2Id": "farm.berryclub.ek.near",
        "token1Supply": "3521962818313050113",
        "token2Supply": "415813059454023",
        "fee": 60,
        "shares": "161983702808881747485",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 160,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 162,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 163,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 164,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 165,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 166,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 169,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 174,
        "token1Id": "wrap.near",
        "token2Id": "avrit.near",
        "token1Supply": "28912760121472586870445773",
        "token2Supply": "349518150913905829626",
        "fee": 30,
        "shares": "1000815381284575987261349",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 175,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 178,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 179,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 181,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 182,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 183,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 184,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 185,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 186,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 187,
        "token1Id": "wrap.near",
        "token2Id": "dan.tkn.near",
        "token1Supply": "5000000000000093513521313",
        "token2Supply": "10000000000000000000",
        "fee": 30,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 190,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 191,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 192,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 193,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 194,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 202,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 203,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 209,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 212,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 213,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 214,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 217,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 222,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 223,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 224,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 225,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 226,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "95028821025706768884",
        "token2Supply": "368750736314997339711747",
        "fee": 30,
        "shares": "1823898587394637885359",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 230,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 235,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 236,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 239,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 240,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 241,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 242,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 244,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 245,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 247,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 248,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 249,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 253,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 254,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 257,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 258,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 259,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 263,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 266,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 267,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 269,
        "token1Id": "wrap.near",
        "token2Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 273,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 278,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 279,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 282,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 283,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 285,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 286,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 288,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 289,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 293,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 296,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 297,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 301,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 302,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 305,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 307,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 308,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 310,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 311,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 312,
        "token1Id": "wrap.near",
        "token2Id": "mz.tkn.near",
        "token1Supply": "10000000000000000000000000",
        "token2Supply": "10000",
        "fee": 30,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 313,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 314,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 317,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 318,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 319,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 321,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 323,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 324,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 325,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 326,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 327,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 329,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 331,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 333,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 334,
        "token1Id": "wrap.near",
        "token2Id": "meritocracy.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 336,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 337,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 338,
        "token1Id": "wrap.near",
        "token2Id": "wst.tkn.near",
        "token1Supply": "1787799260055862509118568",
        "token2Supply": "6251210539301317359807077444",
        "fee": 60,
        "shares": "1621046394429345231143064",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 343,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 344,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 346,
        "token1Id": "wrap.near",
        "token2Id": "288f5c0fc03d073378d004201129bc145a4a82fc.factory.bridge.near",
        "token1Supply": "20000021956156748630",
        "token2Supply": "179283424625160442",
        "fee": 30,
        "shares": "399202194415357323",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 349,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 350,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 352,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 353,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 354,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 359,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 361,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 362,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 364,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 366,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 367,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 368,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 369,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 371,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "30148946445468617938001466",
        "token2Supply": "1422400682301228820870",
        "fee": 20,
        "shares": "5507906807473189231446307045",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 372,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 373,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 374,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 378,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 300,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 381,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 382,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 383,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 384,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 385,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 386,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 387,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 388,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 389,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 390,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 391,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 392,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 393,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 395,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 396,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 399,
        "token1Id": "wrap.near",
        "token2Id": "0d8775f648430679a709e98d2b0cb6250d2887ef.factory.bridge.near",
        "token1Supply": "17646604327363075307",
        "token2Supply": "200002574334676",
        "fee": 60,
        "shares": "1980227429557025971",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 400,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 402,
        "token1Id": "wrap.near",
        "token2Id": "gachi.tkn.near",
        "token1Supply": "2000000000000000000000000",
        "token2Supply": "199000000000000000000",
        "fee": 20,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 404,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 405,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 406,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 411,
        "token1Id": "wrap.near",
        "token2Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 415,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 419,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 420,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 421,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 422,
        "token1Id": "wrap.near",
        "token2Id": "111111111117dc0aa78b770fa6a738034120c302.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 425,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 426,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 427,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 428,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 430,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 431,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 432,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 433,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 434,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 435,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 437,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 442,
        "token1Id": "wrap.near",
        "token2Id": "c944e90c64b2c07662a292be6244bdf05cda44a7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 444,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 445,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 448,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 449,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 450,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 453,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 454,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 455,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 456,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 457,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 458,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 459,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 460,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 461,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 462,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 464,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 468,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 469,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 470,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 474,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 475,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 476,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 478,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 480,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 481,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 482,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 484,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 485,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 493,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 498,
        "token1Id": "wrap.near",
        "token2Id": "adtoken.near",
        "token1Supply": "5729700418662278568348",
        "token2Supply": "136633658665167650334889",
        "fee": 30,
        "shares": "758139097540381634598935",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 500,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 501,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 502,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 505,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 506,
        "token1Id": "wrap.near",
        "token2Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 507,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 508,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 509,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 510,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 511,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 512,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 514,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 515,
        "token1Id": "wrap.near",
        "token2Id": "de30da39c46104798bb5aa3fe8b9e0e1f348163f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 518,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 520,
        "token1Id": "wrap.near",
        "token2Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 521,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 522,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 525,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 526,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 528,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 529,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 530,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 531,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 532,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 533,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 534,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 537,
        "token1Id": "wrap.near",
        "token2Id": "adtoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 538,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 539,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 540,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 542,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 545,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 546,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 547,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 548,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 549,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 551,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 552,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 554,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 555,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 556,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 557,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 558,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 560,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 561,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "132903668539935631929643",
        "token2Supply": "128142458536944783494317",
        "fee": 30,
        "shares": "2244464616722530131509",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 562,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 563,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 565,
        "token1Id": "wrap.near",
        "token2Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 566,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 567,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 568,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 569,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 570,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 571,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 573,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 574,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 576,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 577,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 580,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 581,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 583,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 585,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 587,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 588,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 589,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 591,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 592,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 594,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 597,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 598,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 599,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 600,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 601,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 602,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 603,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 604,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 605,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 606,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 609,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 611,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 612,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 613,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 614,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 615,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 616,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 617,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 625,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 626,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 630,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 632,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 633,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 634,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 635,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 636,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 637,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 638,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 639,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 640,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 641,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 642,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 643,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 644,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 645,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 646,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 647,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 649,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 650,
        "token1Id": "wrap.near",
        "token2Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 651,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 652,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 653,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 654,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 660,
        "token1Id": "wrap.near",
        "token2Id": "111111111117dc0aa78b770fa6a738034120c302.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 663,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 664,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 666,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 667,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 669,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 678,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 679,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 681,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 682,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 683,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 684,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 685,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 687,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 690,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 691,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 692,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 693,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 694,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 702,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 703,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 706,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 708,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 709,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 710,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 711,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 718,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 719,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 720,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 721,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 727,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 729,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 732,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 740,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 741,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 745,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 747,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 752,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 756,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 758,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 763,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 766,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 767,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 768,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 769,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 771,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 772,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 775,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 776,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 779,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 782,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 785,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 787,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 790,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 791,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 792,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 793,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 797,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 798,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 803,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 805,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 809,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 812,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 813,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 815,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 818,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 820,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 821,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 825,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 826,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 827,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 832,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 833,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 834,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 840,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 844,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 847,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 848,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 849,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 852,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "23917152255733411915138231212",
        "token2Supply": "2905798946747386145757634",
        "fee": 30,
        "shares": "3705030451171276200420985138",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 856,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 867,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 871,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 876,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 877,
        "token1Id": "wrap.near",
        "token2Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 878,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 886,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 895,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 898,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 899,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 900,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 901,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 903,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 905,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 906,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 909,
        "token1Id": "wrap.near",
        "token2Id": "token.shrm.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 910,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 922,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 928,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 933,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 934,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 938,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 942,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 943,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 944,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 945,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 947,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 948,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 949,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 950,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 951,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 953,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 954,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 962,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 963,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 973,
        "token1Id": "wrap.near",
        "token2Id": "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 974,
        "token1Id": "wrap.near",
        "token2Id": "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near",
        "token1Supply": "66543001548500476309952",
        "token2Supply": "1102",
        "fee": 30,
        "shares": "545500420399963489808",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 975,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 977,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 979,
        "token1Id": "wrap.near",
        "token2Id": "damn.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 980,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 981,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 982,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 983,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 984,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 988,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 999,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1003,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1004,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1007,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1008,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1009,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1013,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1014,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1016,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1024,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1025,
        "token1Id": "wrap.near",
        "token2Id": "floki.tkn.near",
        "token1Supply": "990249825768566908852",
        "token2Supply": "33065467439112757364343",
        "fee": 60,
        "shares": "34806966681827610124",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1027,
        "token1Id": "wrap.near",
        "token2Id": "floki.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 250,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1028,
        "token1Id": "wrap.near",
        "token2Id": "floki.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 300,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1029,
        "token1Id": "wrap.near",
        "token2Id": "d3g3n.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 500,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1031,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1036,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1037,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1038,
        "token1Id": "wrap.near",
        "token2Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1040,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1055,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1058,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1065,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1066,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1069,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1073,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1082,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1089,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1090,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1095,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1096,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1103,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1108,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1109,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1111,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1114,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1115,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1122,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1123,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1127,
        "token1Id": "wrap.near",
        "token2Id": "nvp.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1132,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1133,
        "token1Id": "wrap.near",
        "token2Id": "token.shrm.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1134,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1140,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1141,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1143,
        "token1Id": "wrap.near",
        "token2Id": "net.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1144,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1145,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1146,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1149,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1150,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1151,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1152,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1153,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1155,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1156,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1157,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1158,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1159,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1165,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1166,
        "token1Id": "wrap.near",
        "token2Id": "farm.berryclub.ek.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1167,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1172,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1173,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1174,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1175,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1176,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1180,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1181,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1182,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1184,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1185,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1186,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1189,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1190,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1193,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1194,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1200,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1204,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1209,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1215,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1216,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1217,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1218,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1219,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1221,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1222,
        "token1Id": "wrap.near",
        "token2Id": "nearpunk.tkn.near",
        "token1Supply": "3108293254098904713",
        "token2Supply": "23199320666799568209813722",
        "fee": 30,
        "shares": "266964659615808616959",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1223,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1224,
        "token1Id": "wrap.near",
        "token2Id": "neardog.tkn.near",
        "token1Supply": "1846649189932348222",
        "token2Supply": "39123533744041304606492503",
        "fee": 30,
        "shares": "267009815326892878930",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1225,
        "token1Id": "wrap.near",
        "token2Id": "duck.tkn.near",
        "token1Supply": "1105073250998554103",
        "token2Supply": "124864555433136106770178905",
        "fee": 30,
        "shares": "367457888149905840388",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1226,
        "token1Id": "wrap.near",
        "token2Id": "nearkat.tkn.near",
        "token1Supply": "42630967763720",
        "token2Supply": "980718783776916460273016496241",
        "fee": 30,
        "shares": "200728649383292979006",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1227,
        "token1Id": "wrap.near",
        "token2Id": "neardog.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1234,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1242,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1243,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1247,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1248,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1250,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1252,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1254,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1256,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1257,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1258,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1260,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1261,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1262,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1264,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1265,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1268,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1269,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1270,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1271,
        "token1Id": "wrap.near",
        "token2Id": "infinity.tkn.near",
        "token1Supply": "249351265302840604637",
        "token2Supply": "8778257732",
        "fee": 30,
        "shares": "93513832763496207158",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1272,
        "token1Id": "wrap.near",
        "token2Id": "infinity.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1275,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1282,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1283,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1287,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1289,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1292,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1293,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 10,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1294,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1305,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1307,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1309,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1310,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1311,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1313,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1314,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1317,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1318,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1322,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1323,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1324,
        "token1Id": "wrap.near",
        "token2Id": "token.shrm.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1326,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1327,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1332,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1333,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1334,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1335,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1336,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1339,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1342,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1344,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1346,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1000,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1353,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 70,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1354,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 70,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1356,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1357,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1360,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1363,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1365,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1374,
        "token1Id": "wrap.near",
        "token2Id": "berryclub.ek.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1376,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1377,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1378,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1381,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1382,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1390,
        "token1Id": "wrap.near",
        "token2Id": "duck.tkn.near",
        "token1Supply": "10774196257",
        "token2Supply": "93284804872991644956105",
        "fee": 30,
        "shares": "100061555192571433487",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1391,
        "token1Id": "wrap.near",
        "token2Id": "nearkat.tkn.near",
        "token1Supply": "1004867161777079",
        "token2Supply": "1000200055043290765",
        "fee": 30,
        "shares": "100061550382586234477",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1392,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1393,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1394,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1401,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1403,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1404,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1405,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1406,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1408,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1409,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1411,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1414,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1416,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1417,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1418,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1419,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1420,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1423,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1427,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1428,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1430,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1431,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1432,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1435,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1436,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1438,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1439,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1440,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1441,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1443,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1444,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1445,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1446,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1448,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1449,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1450,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1453,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1455,
        "token1Id": "wrap.near",
        "token2Id": "nk.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1458,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1459,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1460,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1461,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1462,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1463,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1465,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1466,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1468,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1469,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1472,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1475,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1476,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1478,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1479,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1483,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1485,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1487,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1488,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1489,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1490,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1493,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1494,
        "token1Id": "wrap.near",
        "token2Id": "indulgency.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1495,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1498,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1500,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1501,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1502,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1513,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1514,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1518,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1519,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1521,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1523,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1525,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1526,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1527,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1529,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1530,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1531,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1533,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1534,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1536,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1537,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1538,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1542,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1543,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1544,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1545,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1546,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1547,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1549,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1552,
        "token1Id": "wrap.near",
        "token2Id": "bsa.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1553,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1558,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1559,
        "token1Id": "wrap.near",
        "token2Id": "meta-token.near",
        "token1Supply": "24906923001862622240112428",
        "token2Supply": "9970199297265739261751745170",
        "fee": 30,
        "shares": "32728588929442080512678314",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1560,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1561,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1562,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1563,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1565,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1566,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1567,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1571,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1577,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1578,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1579,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1582,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1585,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1586,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1587,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1589,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1594,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1600,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1602,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1603,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1609,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1611,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1612,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1614,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1625,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1627,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1629,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1631,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1632,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1634,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1636,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1639,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1640,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1641,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1644,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1645,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1646,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1647,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1648,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1649,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1650,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1651,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1652,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1656,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1660,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1665,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1669,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1670,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1671,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1675,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1676,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1679,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1680,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1681,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1682,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1683,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1685,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1686,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1687,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1689,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1690,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1691,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1694,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1698,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1699,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1700,
        "token1Id": "wrap.near",
        "token2Id": "hak.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1704,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1710,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1711,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1718,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1719,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1720,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1721,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1722,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1723,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1724,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1729,
        "token1Id": "wrap.near",
        "token2Id": "nd.tkn.near",
        "token1Supply": "142294085521899094436",
        "token2Supply": "24759395501208744",
        "fee": 60,
        "shares": "1000841946226854054072673",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1730,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1734,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1739,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1740,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1741,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1748,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1750,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1751,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1760,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1761,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1765,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1773,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1774,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1778,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1781,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1782,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1783,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1787,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1788,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1791,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 100,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1792,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1799,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1801,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1803,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1805,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1813,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1816,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1817,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1818,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1819,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1822,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1823,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1824,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1826,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1827,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1828,
        "token1Id": "wrap.near",
        "token2Id": "farm.berryclub.ek.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1829,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1836,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1837,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1838,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1839,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1840,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1841,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1845,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1846,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1848,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1853,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1854,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1855,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1856,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1858,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1861,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1862,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1866,
        "token1Id": "wrap.near",
        "token2Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1868,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1870,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1871,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1878,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1879,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1880,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1881,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1882,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1883,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1887,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1888,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1891,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1892,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1897,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1900,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1901,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1902,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1909,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1934,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1943,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1944,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1955,
        "token1Id": "wrap.near",
        "token2Id": "meta-token.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1958,
        "token1Id": "wrap.near",
        "token2Id": "meta-token.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1967,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1972,
        "token1Id": "wrap.near",
        "token2Id": "meta-token.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1974,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1976,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2001,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2004,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2011,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2013,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2017,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2018,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2020,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2021,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2022,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2023,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2026,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2029,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2034,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2035,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2036,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2041,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2047,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2048,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2049,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2052,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2053,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2054,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2057,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2059,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2060,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2061,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2063,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2066,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2067,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2069,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2071,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2073,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2077,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2078,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2083,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2088,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2095,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2096,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2100,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2101,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2102,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2103,
        "token1Id": "wrap.near",
        "token2Id": "azerotha.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2104,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2106,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2108,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2110,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2117,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2118,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2120,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2125,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2127,
        "token1Id": "wrap.near",
        "token2Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2128,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2135,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2136,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2144,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2153,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2157,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2165,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2168,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2169,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2171,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2172,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2174,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2175,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2177,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2181,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2193,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2205,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2206,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2207,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2208,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2209,
        "token1Id": "wrap.near",
        "token2Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2210,
        "token1Id": "wrap.near",
        "token2Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2211,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2212,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2219,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2222,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2225,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2228,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2229,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2233,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2234,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2235,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2250,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2252,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2255,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2256,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2258,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2259,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2260,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2262,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2270,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2271,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2272,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2273,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2274,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2275,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2277,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2283,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2284,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2285,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2286,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2294,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2295,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2297,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2298,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2299,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2318,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2319,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2321,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2322,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2323,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2325,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2326,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2327,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2328,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2329,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2331,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2332,
        "token1Id": "wrap.near",
        "token2Id": "token.cheddar.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2333,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2335,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2336,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2338,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2343,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2344,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2347,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2350,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2355,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2358,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2359,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2362,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2366,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2368,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2369,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2373,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2374,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2375,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2376,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2377,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2378,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2379,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2384,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2389,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2390,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2395,
        "token1Id": "wrap.near",
        "token2Id": "token.paras.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2396,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2397,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2398,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2402,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2403,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2404,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2406,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2417,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2418,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2419,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2420,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2421,
        "token1Id": "wrap.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2422,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2423,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2424,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2425,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2427,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2428,
        "token1Id": "wrap.near",
        "token2Id": "nmeme.tkn.near",
        "token1Supply": "9949698170842973598470543",
        "token2Supply": "100000000000000000000000",
        "fee": 30,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2429,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2436,
        "token1Id": "wrap.near",
        "token2Id": "myriadcore.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1900,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2444,
        "token1Id": "wrap.near",
        "token2Id": "myriadcore.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2445,
        "token1Id": "wrap.near",
        "token2Id": "aurora",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2453,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2454,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2455,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2456,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2457,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2458,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2460,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2461,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2462,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2463,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2464,
        "token1Id": "wrap.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2471,
        "token1Id": "wrap.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2472,
        "token1Id": "wrap.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2475,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2476,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2478,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2479,
        "token1Id": "wrap.near",
        "token2Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2481,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2482,
        "token1Id": "wrap.near",
        "token2Id": "dbio.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2485,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2487,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2490,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2491,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2494,
        "token1Id": "wrap.near",
        "token2Id": "pixeltoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2495,
        "token1Id": "wrap.near",
        "token2Id": "pixeltoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2498,
        "token1Id": "wrap.near",
        "token2Id": "pixeltoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2500,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2501,
        "token1Id": "wrap.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2504,
        "token1Id": "wrap.near",
        "token2Id": "skyward-pixeltoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2505,
        "token1Id": "wrap.near",
        "token2Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2512,
        "token1Id": "wrap.near",
        "token2Id": "pixeltoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2523,
        "token1Id": "wrap.near",
        "token2Id": "whales.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2524,
        "token1Id": "wrap.near",
        "token2Id": "whales.tkn.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2527,
        "token1Id": "wrap.near",
        "token2Id": "pixeltoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2529,
        "token1Id": "wrap.near",
        "token2Id": "pixeltoken.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2530,
        "token1Id": "wrap.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2531,
        "token1Id": "wrap.near",
        "token2Id": "meta-pool.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 3,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "3261996451",
        "token2Supply": "304306342709289283750201906",
        "fee": 30,
        "shares": "8961777751403231002448648",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 74,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "5",
        "token2Supply": "176031974022",
        "fee": 5,
        "shares": "77679295417957587461",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 77,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 78,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 90,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 91,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 99,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 10,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 101,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "19512018",
        "token2Supply": "7781497323070932614",
        "fee": 40,
        "shares": "1061665764015280301097766",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 102,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 105,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 106,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 126,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "padthai.near",
        "token1Supply": "18016",
        "token2Supply": "122",
        "fee": 60,
        "shares": "386915689302156418587",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 137,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 208,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 227,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 228,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 300,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "token.v2.ref-finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 328,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 365,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 408,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 416,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "token.skyward.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 438,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 439,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 447,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 466,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 473,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 486,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 488,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 624,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 627,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 668,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 695,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 714,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 744,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 804,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 817,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 837,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1053,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1092,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1125,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1308,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1316,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1643,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2086,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2109,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2148,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2151,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2152,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "v3.oin_finance.near",
        "token1Supply": "996544272",
        "token2Supply": "107977269935",
        "fee": 60,
        "shares": "607299352356155258737460",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 0,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "93734261774385428102797",
        "token2Supply": "443044279141047055395985360197",
        "fee": 30,
        "shares": "14894147388850017163069826354",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1,
        "token1Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "5442619492534042593",
        "token2Supply": "1190331494650078084656398541",
        "fee": 30,
        "shares": "94153416269488500162185067",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "850788020981184649057765",
        "token2Supply": "78315240039632013083874744912",
        "fee": 30,
        "shares": "3692048300741786634438045355",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 3,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "3261996451",
        "token2Supply": "304306342709289283750201906",
        "fee": 30,
        "shares": "8961777751403231002448648",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 4,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "1115396800672",
        "token2Supply": "102481562411431752964553070636",
        "fee": 30,
        "shares": "4666336087238651591737617140",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 5,
        "token1Id": "berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "3630288394371789652269",
        "token2Supply": "8019461248590324434918390",
        "fee": 30,
        "shares": "30017520534575283740762618",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 9,
        "token1Id": "rekt.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "16043581942828280784305915",
        "token2Supply": "6184955790948248524432894",
        "fee": 20,
        "shares": "1013648694868296231192048",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 11,
        "token1Id": "marmaj.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "3428159792246782633805",
        "token2Supply": "2954555747808597652166407456",
        "fee": 19,
        "shares": "2469116923058348220517059851",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 16,
        "token1Id": "de30da39c46104798bb5aa3fe8b9e0e1f348163f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "541401477617422667274",
        "token2Supply": "361389383939587976485085594",
        "fee": 19,
        "shares": "371603567089944166403173830",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 20,
        "token1Id": "avb.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "994059500425457466183",
        "token2Supply": "1008290238767088601820333",
        "fee": 40,
        "shares": "1000114863493320835052287",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 24,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 10,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 30,
        "token1Id": "mika.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "33193270642371682867",
        "token2Supply": "3990465595475991892414836",
        "fee": 19,
        "shares": "26333588012492414870522610",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 31,
        "token1Id": "blaze.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "30000000000000000000000",
        "token2Supply": "10000000000000000000000000",
        "fee": 40,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 35,
        "token1Id": "farm.berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "954075912075830462901",
        "token2Supply": "1550594817755442088177417",
        "fee": 40,
        "shares": "141156220608279458112551",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 38,
        "token1Id": "asc.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "2451535916",
        "token2Supply": "400074317897183772801",
        "fee": 60,
        "shares": "28577553645890415899",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 39,
        "token1Id": "berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 40,
        "token1Id": "berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 41,
        "token1Id": "farm.berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 42,
        "token1Id": "taliban.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "285467174127980539351673408",
        "token2Supply": "354365529828177218082603",
        "fee": 40,
        "shares": "1000576532861528326341296",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 43,
        "token1Id": "taliban.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 44,
        "token1Id": "groove.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 45,
        "token1Id": "mbga.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 47,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "1213978686911773184526342",
        "token2Supply": "297659812918389212796425734785",
        "fee": 40,
        "shares": "310420628949912272886096421713",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 53,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 58,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 61,
        "token1Id": "magic.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "1538891121643320195593395348",
        "token2Supply": "108672314168792857694821073",
        "fee": 40,
        "shares": "1000170158440263897566974",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 65,
        "token1Id": "hongdou.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 71,
        "token1Id": "hodl.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "872",
        "token2Supply": "4904081669079493183930267",
        "fee": 40,
        "shares": "2667816252386824374546643",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 75,
        "token1Id": "ikenga.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 77,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 78,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 79,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "1825265072061922248929875",
        "token2Supply": "360817348331663239723061101889",
        "fee": 40,
        "shares": "38696255581655213316878596926",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 84,
        "token1Id": "flct.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 90,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 91,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 92,
        "token1Id": "azerotha.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 93,
        "token1Id": "azerotha.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 95,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 97,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 104,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "51012779713838",
        "token2Supply": "10929184584190315072",
        "fee": 20,
        "shares": "333417533323336122622",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 105,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 106,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 108,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 110,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 117,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 120,
        "token1Id": "514910771af9ca656af840dff83e8264ecf986ca.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "370866788492927962",
        "token2Supply": "1131000648031897412324026",
        "fee": 30,
        "shares": "168194729027738565983462",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 124,
        "token1Id": "padthai.near",
        "token2Id": "wrap.near",
        "token1Supply": "5916",
        "token2Supply": "119106902550134738971705",
        "fee": 60,
        "shares": "825560273273296263147",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 127,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 129,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 130,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 133,
        "token1Id": "ikenga.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 134,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 143,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 148,
        "token1Id": "111111111117dc0aa78b770fa6a738034120c302.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "759817699887200",
        "token2Supply": "20098719603750758572599",
        "fee": 100,
        "shares": "500695693595947301633",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 161,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 167,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 168,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 170,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 171,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 172,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 173,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 176,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 180,
        "token1Id": "pixiv.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "41598804442000000000000000000",
        "token2Supply": "5000000000000000000000000",
        "fee": 30,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 188,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 189,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 195,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 196,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 198,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 199,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 200,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 201,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 204,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 207,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 208,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 210,
        "token1Id": "cat.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 216,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 218,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 219,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 220,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 221,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 229,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 231,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 232,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 234,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 237,
        "token1Id": "beer.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "99874163555642819728",
        "token2Supply": "99917260496229342530727227",
        "fee": 30,
        "shares": "2496925900242335705405041",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 243,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 246,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 250,
        "token1Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "4648250743730361718041",
        "token2Supply": "11085771883462471459569978464",
        "fee": 30,
        "shares": "312070351997940345729559367",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 251,
        "token1Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 252,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 255,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 256,
        "token1Id": "neardoge.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 260,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 261,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 262,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 265,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 270,
        "token1Id": "bed4ab0019ff361d83ddeb74883dac8a70f5ea1e.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "134",
        "token2Supply": "1500000000000000000000000",
        "fee": 30,
        "shares": "1000332088518983478744775",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 271,
        "token1Id": "bed4ab0019ff361d83ddeb74883dac8a70f5ea1e.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 274,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 275,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 276,
        "token1Id": "a4ef4b0b23c1fc81d3f9ecf93510e64f58a4a016.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "47354043412014626189031",
        "token2Supply": "3016652482869620267566402553",
        "fee": 30,
        "shares": "1001001152326556237337349",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 284,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 290,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 291,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 292,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 294,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 295,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 303,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 304,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 309,
        "token1Id": "socialmeet.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "16549801622020366869203",
        "token2Supply": "5615492436163283838538170",
        "fee": 60,
        "shares": "273311770364450989365632455",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 316,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 330,
        "token1Id": "meritocracy.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "587994964782060808013520911",
        "token2Supply": "3144505102475981037781022",
        "fee": 60,
        "shares": "29702648956212407897850677418",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 332,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "179889900843762634",
        "token2Supply": "3601520317729390253122",
        "fee": 40,
        "shares": "1000304815124941315449076",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 335,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 339,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 340,
        "token1Id": "nk.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "32772144606951924115577",
        "token2Supply": "319039642771321086",
        "fee": 50,
        "shares": "450814283849260160087",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 341,
        "token1Id": "nk.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "72910700293342420170",
        "token2Supply": "717821169104959",
        "fee": 45,
        "shares": "720707750687051867092",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 342,
        "token1Id": "nk.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 345,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 347,
        "token1Id": "nut.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "157853711716231665194",
        "token2Supply": "6356580361976864284895018",
        "fee": 30,
        "shares": "1000229504155967172402560",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 348,
        "token1Id": "jbouw.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 351,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 355,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 356,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 357,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 358,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 360,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 377,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "2758257650671779355297499",
        "token2Supply": "58538745026555089995415900287",
        "fee": 30,
        "shares": "103211388612533499558049383890",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 379,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 380,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 394,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 397,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 407,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 408,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 409,
        "token1Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 410,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 414,
        "token1Id": "gza.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "150000000000000000000",
        "token2Supply": "1000000000000000000000000",
        "fee": 30,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 429,
        "token1Id": "adtoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "81124494607717035936912",
        "token2Supply": "3401936647665129870867",
        "fee": 30,
        "shares": "1607901364648972089274950",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 436,
        "token1Id": "nut.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 440,
        "token1Id": "pw.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 451,
        "token1Id": "adtoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 463,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 466,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 467,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 471,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 473,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 477,
        "token1Id": "nut.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 479,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 486,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 487,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 488,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 495,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 503,
        "token1Id": "berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 504,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 513,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 517,
        "token1Id": "illiapolosukhin.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "551182549417230244496",
        "token2Supply": "22684254133596593588917",
        "fee": 60,
        "shares": "11024588999618621544167891",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 523,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 527,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 535,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "501308931282295292496906124722",
        "token2Supply": "522402085076913968056718622358",
        "fee": 30,
        "shares": "504873401728992608872971897072",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 536,
        "token1Id": "adtoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 541,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 543,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 544,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 550,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 559,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 564,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 572,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 575,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 579,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 582,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 584,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 586,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 590,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 593,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 595,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 596,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 607,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 608,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 610,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 618,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 619,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 620,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 621,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 622,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 623,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 624,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 627,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 628,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 631,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 655,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 656,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 657,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 658,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 659,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 662,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 665,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 670,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 677,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 680,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 688,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 689,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 695,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 696,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 697,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 701,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 704,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 705,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 707,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 712,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 713,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 714,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 715,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 717,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 722,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 723,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 725,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 726,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 730,
        "token1Id": "illiapolosukhin.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 731,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 733,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 736,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 737,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 738,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 739,
        "token1Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 742,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 743,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 744,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 746,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 748,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 749,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 750,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 751,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 753,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 754,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 755,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 757,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 759,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 762,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 764,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 765,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 770,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 773,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 774,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 777,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 780,
        "token1Id": "illiapolosukhin.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 781,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 783,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 784,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 786,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 788,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 789,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 794,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 795,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 796,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 802,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 804,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 806,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 807,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 808,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 810,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 811,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 814,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 816,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 819,
        "token1Id": "token.cheddar.near",
        "token2Id": "wrap.near",
        "token1Supply": "8299783874994027792264026082",
        "token2Supply": "17526015770736584785833875",
        "fee": 30,
        "shares": "299825792160712584939005190",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 822,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 824,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 830,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 831,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 837,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 838,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 839,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 841,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 842,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 843,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 15,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 845,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 846,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 850,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 851,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 853,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 854,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 855,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 857,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 858,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 859,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 868,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 869,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 870,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 872,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 873,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 874,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 881,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 882,
        "token1Id": "token.shrm.near",
        "token2Id": "wrap.near",
        "token1Supply": "6187528192932425846209",
        "token2Supply": "40875842519635475249829493",
        "fee": 30,
        "shares": "12313716740963238159043450",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 883,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 884,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 885,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 888,
        "token1Id": "adtoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 889,
        "token1Id": "nearbit.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "834045356380502675866989",
        "token2Supply": "48839915484815819485",
        "fee": 30,
        "shares": "19907884366974131815437150",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 890,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 891,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 892,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 893,
        "token1Id": "token.shrm.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 894,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 896,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 897,
        "token1Id": "token.shrm.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 902,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 904,
        "token1Id": "token.shrm.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 907,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 908,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 915,
        "token1Id": "neir.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 916,
        "token1Id": "neir.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 917,
        "token1Id": "a4ef4b0b23c1fc81d3f9ecf93510e64f58a4a016.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 918,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 919,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 920,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 921,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 923,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 924,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 925,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 927,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 929,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 930,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 931,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 932,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 935,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 936,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 939,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 940,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 941,
        "token1Id": "token.shrm.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 952,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 955,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 956,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 957,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 958,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 959,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 960,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 961,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 964,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 965,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 966,
        "token1Id": "nearbit.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 968,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 970,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 972,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 978,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 985,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 986,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 987,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 989,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 991,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 992,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 993,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 994,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 995,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 996,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 997,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 998,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1000,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1001,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1002,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1005,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1006,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1010,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1012,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1015,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1017,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1018,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1021,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1022,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1026,
        "token1Id": "floki.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1032,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1033,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1034,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1035,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1039,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1041,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1042,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1043,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1044,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1045,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1046,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1047,
        "token1Id": "token.shrm.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1048,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1050,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1051,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1052,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1053,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1054,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1059,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1061,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1064,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1067,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1068,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1070,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1071,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1072,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1075,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1076,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1077,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1078,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1079,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1080,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1081,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1083,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1085,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1086,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1087,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1088,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1091,
        "token1Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1092,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1093,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1094,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1097,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1098,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1099,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1101,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1102,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1104,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1105,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1106,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1107,
        "token1Id": "boo.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1110,
        "token1Id": "111111111117dc0aa78b770fa6a738034120c302.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1112,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1113,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1116,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1117,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1118,
        "token1Id": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1119,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1120,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1121,
        "token1Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1125,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1126,
        "token1Id": "nvp.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "1200000000000000000000",
        "token2Supply": "2500833611203734578192731",
        "fee": 20,
        "shares": "1000033336111574170547203",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1128,
        "token1Id": "nvp.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1129,
        "token1Id": "net.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "4087356081376843",
        "token2Supply": "94093188197770550198",
        "fee": 60,
        "shares": "76666506859642525775",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1130,
        "token1Id": "nvp.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1131,
        "token1Id": "nvp.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1135,
        "token1Id": "nvp.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1136,
        "token1Id": "nvp.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1137,
        "token1Id": "rekt.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1142,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1148,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1160,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1161,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 300,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1162,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 300,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1163,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1168,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1169,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1170,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1171,
        "token1Id": "feral.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "5333541708074459",
        "token2Supply": "536912430856859013969",
        "fee": 50,
        "shares": "531865913569262207050",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1178,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "769606653852",
        "token2Supply": "17092825837357917225194938215",
        "fee": 40,
        "shares": "20581760980334160969459029",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1183,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1187,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1188,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1191,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1192,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1196,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1197,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1201,
        "token1Id": "de30da39c46104798bb5aa3fe8b9e0e1f348163f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1202,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1207,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "483356119411248139885",
        "token2Supply": "113428438564235944456733942044",
        "fee": 30,
        "shares": "3499891955785082780976158898",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1210,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1211,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1212,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1220,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1249,
        "token1Id": "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1253,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1255,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1259,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1263,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1266,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1267,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1273,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1274,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1276,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1277,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1278,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1279,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1280,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1281,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1284,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1286,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1291,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1295,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1297,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1298,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1299,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1300,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1306,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1308,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1312,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1315,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1316,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1319,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1325,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1328,
        "token1Id": "tipjargon.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1331,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1341,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1343,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1345,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "2759982503531936194581",
        "token2Supply": "8904418489600929353630818",
        "fee": 30,
        "shares": "59325614274516704085358205",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1347,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1348,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1355,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1358,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "14019400722517987",
        "token2Supply": "71664286380155541422",
        "fee": 30,
        "shares": "100055607927743416988",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1359,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1362,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "2245271381612324160",
        "token2Supply": "10085509668040483132003",
        "fee": 30,
        "shares": "3347378169635372286228",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1367,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1368,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1369,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1370,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1371,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "3833956603780719648792248",
        "token2Supply": "12111271649946800331172818358",
        "fee": 30,
        "shares": "7875955089706790152058311",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1379,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1380,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1386,
        "token1Id": "nearkat.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1387,
        "token1Id": "duck.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1389,
        "token1Id": "nearkat.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1395,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "205255339289575705300978",
        "token2Supply": "247699548191511763927731354356",
        "fee": 30,
        "shares": "8242663007790609099417266",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1398,
        "token1Id": "ter.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "936386819147146",
        "token2Supply": "71505664443815959948903",
        "fee": 30,
        "shares": "2544998311560887195166244",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1400,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1402,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1410,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1412,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "325212411407754174916",
        "token2Supply": "1082683094077877839580083",
        "fee": 30,
        "shares": "3125805789822466763882",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1421,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1422,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1424,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1425,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1426,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1429,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1434,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1437,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1442,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1447,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1451,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1452,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1454,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1456,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1457,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1464,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1467,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1470,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1471,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1473,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1474,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1477,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1480,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1481,
        "token1Id": "firerune.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1482,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1484,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1486,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1492,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1496,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1497,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1499,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1503,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1506,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1510,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1512,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1515,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1516,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1517,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1520,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1522,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1524,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1535,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1539,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1540,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1541,
        "token1Id": "lgbt.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "26110000000000000000",
        "token2Supply": "57522682152284014791766",
        "fee": 30,
        "shares": "1000085128669519485243956",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1550,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1551,
        "token1Id": "bsa.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "4326489734601902854281422133200",
        "token2Supply": "4000000000000000000000000",
        "fee": 60,
        "shares": "1000050018764075697452114",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1554,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1556,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1557,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1564,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1569,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1570,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1572,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1573,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1574,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1575,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1576,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1580,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1581,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1584,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1588,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1590,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1591,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1592,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1593,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1595,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1596,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1597,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1598,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1599,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 10,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1601,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1604,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1606,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1607,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1608,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1613,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1615,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1616,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1617,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1618,
        "token1Id": "288f5c0fc03d073378d004201129bc145a4a82fc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1619,
        "token1Id": "288f5c0fc03d073378d004201129bc145a4a82fc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1621,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1622,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1623,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1624,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1626,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1628,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1630,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1633,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1635,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1638,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1642,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1643,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1654,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1657,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1659,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1661,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1664,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1666,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1667,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1668,
        "token1Id": "meta-token.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1672,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1673,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1674,
        "token1Id": "token.skyward.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1677,
        "token1Id": "nearkat.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1678,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1684,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1688,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1693,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1695,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1696,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1701,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1702,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1703,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1705,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1706,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1707,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "4424570536251238",
        "token2Supply": "508903988373263658378",
        "fee": 30,
        "shares": "13000818841691449104",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1708,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1709,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1712,
        "token1Id": "ter.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "27279583375819",
        "token2Supply": "625181493470091912246",
        "fee": 30,
        "shares": "3756933793425205455778278",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1713,
        "token1Id": "panda.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1714,
        "token1Id": "ctzn.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1715,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1716,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1717,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1725,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1726,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1727,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1728,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1732,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1733,
        "token1Id": "ralfusha.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1735,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1736,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1737,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1742,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1743,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1744,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1745,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1746,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1747,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1749,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1752,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1753,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1754,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1755,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1756,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1757,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1758,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1759,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1762,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1763,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1764,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1767,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1768,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1770,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1771,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1772,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1777,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1784,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1785,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1789,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1790,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1794,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1795,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1796,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1797,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1800,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1802,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1804,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1810,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1811,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1830,
        "token1Id": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1831,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1832,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1833,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1834,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1835,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1842,
        "token1Id": "nvision.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "59280642900805008075001",
        "token2Supply": "15280624276067895281155186",
        "fee": 30,
        "shares": "3313587366404762450145327",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1843,
        "token1Id": "far.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1847,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1849,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1850,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1857,
        "token1Id": "v1.dacha-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "101274449119751269054920",
        "token2Supply": "5469354760334700599664379",
        "fee": 30,
        "shares": "2192343719909921563391084",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1859,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1863,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1864,
        "token1Id": "berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1865,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1867,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1869,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1872,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1873,
        "token1Id": "hak.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1874,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1877,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1884,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1885,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1886,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1893,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1894,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1895,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1896,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1898,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1899,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1906,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1907,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1912,
        "token1Id": "token.shrm.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1914,
        "token1Id": "bxf.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "544308663185766260",
        "token2Supply": "24000582901914221722",
        "fee": 30,
        "shares": "11428979620993856987",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1915,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1916,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1932,
        "token1Id": "far.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1954,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1964,
        "token1Id": "meta-token.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1970,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1973,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1977,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1996,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2000,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2010,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2012,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2014,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2015,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2016,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2019,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2024,
        "token1Id": "nk.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2027,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2028,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2032,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2043,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "34947467465361",
        "token2Supply": "30192706243166731817728020831",
        "fee": 30,
        "shares": "3552478915581790212492829645",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2045,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2050,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2051,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2055,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2056,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2058,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2062,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2065,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2072,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2079,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2086,
        "token1Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2087,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2090,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2091,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2094,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2097,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2098,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2099,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2105,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2107,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2119,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2123,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2124,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2129,
        "token1Id": "bones.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "179483267672371243191",
        "token2Supply": "11150000000000000000000000",
        "fee": 60,
        "shares": "1000049514387940565130647",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2137,
        "token1Id": "stke.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "1000000000000000000000000",
        "token2Supply": "1498000000000000000000000",
        "fee": 60,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2140,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2141,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2142,
        "token1Id": "pixel.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2145,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2146,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2149,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2154,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2158,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2159,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2160,
        "token1Id": "meme.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "98000000000000000",
        "token2Supply": "30000000000000000000000000",
        "fee": 30,
        "shares": "1000000000000000000000000",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2166,
        "token1Id": "aurora",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2167,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2170,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2176,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2183,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2186,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2187,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2188,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2189,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2190,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2191,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2192,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2195,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2197,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2199,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2200,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2201,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2215,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2216,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2217,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2218,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2220,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2221,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2223,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2226,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2227,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2247,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2248,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2249,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2251,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2253,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2257,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2261,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2263,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2265,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2266,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2269,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2276,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2278,
        "token1Id": "farm.berryclub.ek.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1500,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2279,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2280,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2281,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2282,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2287,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2289,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2291,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2293,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2296,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2300,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2302,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2304,
        "token1Id": "d9c2d319cd7e6177336b0a9c93c21cb48d84fb54.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2305,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2306,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2307,
        "token1Id": "flobo.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2315,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2330,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "1104725727301778663542504",
        "token2Supply": "78818631688171902190545402138",
        "fee": 30,
        "shares": "2116042219219799293040444",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2334,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2337,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2340,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2346,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2348,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2351,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2356,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2357,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2360,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2361,
        "token1Id": "wafi.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "200155000000",
        "token2Supply": "9952310098794414026142351",
        "fee": 30,
        "shares": "1000000185856069574982139",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2370,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2371,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2372,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2382,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2385,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2388,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2391,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2392,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2393,
        "token1Id": "xtoken.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2394,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2399,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2400,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2401,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2412,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2413,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2414,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2415,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2416,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2426,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2430,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2431,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "25791817390108663281795",
        "token2Supply": "16138046265479579515161559",
        "fee": 30,
        "shares": "133066554109805467890498501",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2437,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2441,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2442,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2443,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2446,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2447,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2448,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "9156640695816823295785843",
        "token2Supply": "5697782674052827668576769017",
        "fee": 30,
        "shares": "1076456695873962041945606",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2452,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2459,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2465,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2467,
        "token1Id": "b8919522331c59f5c16bdfaa6a121a6e03a91f62.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "11000000",
        "token2Supply": "1818677821223970173683732",
        "fee": 30,
        "shares": "1000021819669624368453038",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2468,
        "token1Id": "b8919522331c59f5c16bdfaa6a121a6e03a91f62.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2469,
        "token1Id": "b8919522331c59f5c16bdfaa6a121a6e03a91f62.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2470,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2473,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2474,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2477,
        "token1Id": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2480,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2483,
        "token1Id": "tamil.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2484,
        "token1Id": "tamil.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2488,
        "token1Id": "dbio.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2489,
        "token1Id": "3ea8ea4237344c9931214796d9417af1a1180770.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2492,
        "token1Id": "zod.near",
        "token2Id": "wrap.near",
        "token1Supply": "17199999999999999411753277005",
        "token2Supply": "13474314036567628207167555",
        "fee": 30,
        "shares": "1522135992951068369193258",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2496,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2497,
        "token1Id": "meta-token.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2499,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2503,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2506,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2507,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2508,
        "token1Id": "lucky_nft.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2509,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2510,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2511,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2514,
        "token1Id": "token.paras.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2515,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2516,
        "token1Id": "token.cheddar.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 5,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2517,
        "token1Id": "whales.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "165094059",
        "token2Supply": "228625499581741008867988",
        "fee": 1900,
        "shares": "37962021210921449093683",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2521,
        "token1Id": "whales.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1900,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2522,
        "token1Id": "whales.tkn.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1100,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2526,
        "token1Id": "pixeltoken.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2528,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2533,
        "token1Id": "meta-pool.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2535,
        "token1Id": "myriadcore.near",
        "token2Id": "wrap.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 14,
        "token1Id": "de30da39c46104798bb5aa3fe8b9e0e1f348163f.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "93037030617722809989",
        "token2Supply": "673675773",
        "fee": 19,
        "shares": "78667909195705372719613506",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 19,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "458507706848275237144751",
        "token2Supply": "4773827",
        "fee": 20,
        "shares": "1433530386500514261296380",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 36,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 40,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 49,
        "token1Id": "token.skyward.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "563665650925460",
        "token2Supply": "68463",
        "fee": 40,
        "shares": "2537639050959585714135",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 57,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "122652671",
        "token2Supply": "121607102",
        "fee": 20,
        "shares": "121928189823766371909218",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 69,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "717828733399428560720",
        "token2Supply": "716382439",
        "fee": 20,
        "shares": "1439085280141858084294245",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 116,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 118,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 119,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 149,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 233,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 70,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 280,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "253969654489546605",
        "token2Supply": "599989",
        "fee": 30,
        "shares": "3191658248956905467589243524",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 315,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 370,
        "token1Id": "f5cfbc74057c610c8ef151a439252680ac68c6dc.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "483807367986776584",
        "token2Supply": "1162207",
        "fee": 20,
        "shares": "1084394899351154490583518",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 372,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 403,
        "token1Id": "token.paras.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "196216951295215159",
        "token2Supply": "58847",
        "fee": 30,
        "shares": "11531165237593739560636285",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 404,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 444,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 474,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 476,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 484,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 538,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 542,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 563,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 600,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 601,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 603,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 640,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 645,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 682,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 690,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 803,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 805,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 818,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 867,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 928,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 967,
        "token1Id": "token.shrm.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 983,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 990,
        "token1Id": "111111111117dc0aa78b770fa6a738034120c302.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1011,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1019,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1020,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1060,
        "token1Id": "token.v2.ref-finance.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1082,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1095,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1156,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1158,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1309,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1662,
        "token1Id": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1663,
        "token1Id": "token.cheddar.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1792,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1848,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 1888,
        "token1Id": "wrap.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2132,
        "token1Id": "tckt.tkn.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2147,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2150,
        "token1Id": "v3.oin_finance.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 60,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2204,
        "token1Id": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 20,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2363,
        "token1Id": "wafi.tkn.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 30,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2518,
        "token1Id": "whales.tkn.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "1909291",
        "token2Supply": "35313",
        "fee": 1900,
        "shares": "7102718604630901519976",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2519,
        "token1Id": "whales.tkn.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1900,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    },
    {
        "id": 2520,
        "token1Id": "whales.tkn.near",
        "token2Id": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near",
        "token1Supply": "0",
        "token2Supply": "0",
        "fee": 1900,
        "shares": "0",
        "update_time": 1643427419,
        "token0_price": "0"
    }
  ].filter((item)=>item.token1Supply!="0"&&item.token2Supply!="0");

  let pools = [];
  let poolInds = [];
  for (var i=0; i<poolList.length;i++) {
      if (!poolInds.includes(poolList[i].id)) {
          poolInds.push(poolList[i].id);
          pools.push(poolList[i]);
      }
  }

let inputToken = 'wrap.near'
let outputToken = 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'
///let outputToken = 'dbio.near'
let totalInput = new Big('100000000000000000000000');


let paths = getPathsFromPools(pools, inputToken, outputToken);
let poolChains = getPoolChainFromPaths(paths, pools);
let routes = getRoutesFromPoolChain(poolChains)
let nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains);

let allocations = getBestOptInput(routes, nodeRoutes, totalInput);
console.log(allocations.map((item)=>item.toString()))


let slippageTolerance = 0.001
getSmartRouteSwapActions(pools, inputToken, outputToken, totalInput, slippageTolerance)

// let phi = getPhiFromRoutes(routes, nodeRoutes,totalInput);
// console.log(phi)
// console.log(nodeRoutes)
// console.log(nodeRoutes.length)
// let allocations = getBestOptInput(routes, nodeRoutes, totalInput);
// console.log(allocations.map((item)=>item.toString()))

// let outputs = getBestOptOutput(routes, nodeRoutes, totalInput);
// console.log(outputs.toString())


// console.log(getOptOutputVecRefined(routes, nodeRoutes, totalInput).allocations.map((item)=>item.toString()))

//  console.log(routes[0])
//  console.log(routes[1])
// console.log(routes.length)

// console.log(routes)

// console.log(getPathsFromPools(pools, inputToken, outputToken))
// console.log(paths.length)
// console.log(poolChains)
//console.log(poolChains[2])
// console.log(routes)
// console.log(routes[0])


   //let resDict = getBestOptimalAllocationsAndOutputs(poolList,inputToken,outputToken,totalInput);
//   let allocations = resDict.allocations;
//   let outputs = resDict.outputs;
//   let routes = resDict.routes;
//   let nodeRoutes = resDict.routes;
//   let actions = getActionListFromRoutesAndAllocations(routes, nodeRoutes, allocations, slippageTolerance);

// let route = {
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
//       'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near': '4773827'
//     }
//   };
//   let path = ['wrap.near','a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near']

