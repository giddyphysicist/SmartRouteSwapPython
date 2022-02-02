const { default: Big } = require('big.js');
// Is any configuration needed to do floor or enforce the number of decimal places?

function getBetaForRoute(route, path) {
    if (route.length == 1) {
        let p = route[0];
        let beta = new Big(p.reserves[path[0]]);
    }
    else if (route.length == 2) {
        let p1 = route[0];
        let p2 = route[1];
        let beta = new Big(p1.reserves[path[0]]).times(new Big(p2.reserves[path[1]]));
    }
    return beta;
}

function getEpsilonForRoute(route, path) {
    if (route.length == 1) {
        // Single Hop case
        let p = route[0];
        let gamma = (new Big(10000).minus(new Big(p.fee))).div(new Big(10000));
        let epsilon = Big(gamma);
    }
    else if(route.length == 2) {
        //Double Hop Case
        let p1 = route[0];
        let p2 = route[1];
        let gamma1 = (new Big(10000).minus(new Big(p1.fee))).div(new Big(10000));
        let gamma2 = (new Big(10000).minus(new Big(p2.fee))).div(Big(10000));
        let epsilon = new Big(p2.reserves[path[1]]).times(new Big(gamma1)).plus(new Big(p1.reserves[path[1]]).times(gamma1).times(gamma2));
    }
    return epsilon;
}

function getAlphaForRoute(route, path) {
    if (route.length == 1) {
        let p = route[0];
        let inputToken = path[0];
        let outputToken = path[1];
        let gamma = (new Big(10000).minus(new Big(p.fee))).div(new Big(10000));
        let alpha = new Big(p.reserves[inputToken]).times(new Big(p.reserves[outputToken]).times(new Big(gamma)));
    }
    else if (route.length == 2) {
        let p1 = route[0];
        let p2 = route[1];
        let inputToken = path[0];
        let middleToken = path[1];
        let outputToken = path[2];
        let gamma1 = (new Big(10000).minus(Big(p1.fee))).div(new Big(10000));
        let gamma2 = (new Big(10000).minus(new Big(p2.fee))).div(new Big(10000));
        let alpha1 = new Big(p1.reserves[inputToken]).times(new Big(p1.reserves[middleToken])).times(gamma1);
        let alpha2 = new Big(p2.reserves[middleToken]).times(new Big(p2.reserves[outputToken])).times(gamma2);
        let alpha = alpha1.times(alpha2);
    }
    return alpha;
}

function getAlphaSumFromRoutes(routes, nodeRoutes) {
    let alphaSum = new Big(0);
    for (var i in routes) {
        let route = routes[i];
        let nodeRoute = nodeRoutes[i];
        let radical = new Big(getAlphaForRoute(route, nodeRoute)).sqrt();
        let denom = new Big(getEpsilonForRoute(route, nodeRoute));
        alphaSum = alphaSum.plus(radical.div(denom))
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
        betaSum.plus(num.div(denom));
    }
    return betaSum;
}

function getPhiFromRoutes(routes, nodeRoutes, totalInput) {
    let alphaSum = getAlphaSumFromRoutes(routes, nodeRoutes);
    let betaSum = getBetaSumFromRoutes(routes, nodeRoutes);
    let phi = (new Big(totalInput).plus(betaSum)).div(alphaSum);
    return phi;
}

function getAllocationForRoute(phi, route, path) {
    let alpha = getAlphaForRoute(route, path);
    let beta = getBetaForRoute(route, path);
    let epsilon = getEpsilonForRoute(route, path);
    let allocation = ((new Big(phi).abs().times(new Big(alpha).sqrt())).minus(beta)).div(epsilon);
    return allocation;
}

function getAllocationVectorForRoutes(phi, routes, nodeRoutes) {
    let allocationVec = [];
    for (var i in routes) {
        allocationVec.push(getAllocationForRoute(phi, routes[i], nodeRoutes[i]));
    }
    return allocationVec;
}

function getPoolChainFromPaths(paths, pools) {
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
    return poolChains;
}

function getCulledPoolChains(poolChains, threshold = 0.001) {
    let newChains = [];
    for (var pathInd in poolChains) {
        let path = poolChains[path];
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
    return newRoutes;
}

function getOutputSingleHop(pool, inputToken, outputToken, totalInput) {
    let totalInput = new Big(totalInput);
    // check if pool is forward or backward for inputToken/outputToken cf. token1Id/token2Id
    if (inputToken === pool.token1Id && outputToken === pool.token2Id) {
        // forward Pool
        let reserves = {inputToken: new Big(pool.token1Supply),
                        outputToken: new Big(pool.token2Supply)};

    } else if (inputToken === pool.token2Id && outputToken === pool.token1Id) {
        // reverse pool
        let reserves = {outputToken: new Big(pool.token1Supply),
                        inputToken: new Big(pool.token2Supply)};
    } else {
        //got the wrong pool.
        console.log(`INPUT TOKENS ${inputToken} and ${outputToken} DO NOT EXIST IN THIS POOL, which contains ${pool.token1Id} and ${pool.token2Id}`);
        return new Big(0);
    }
    let gamma = new Big(10000).minus(new Big(pool.fee)).div(new Big(10000));
    let num = totalInput.times(gamma).times(reserves.outputToken);
    let denom = reserves.inputToken.plus(gamma.times(totalInput));
    return num.div(denom);
}

function getOutputDoubleHop(pools, inputToken, middleToken, outputToken, totalInput) {
    let totalInput = new Big(totalInput);
    for (var poolIndex in pools) {
        let p = pools[poolIndex];
        p['gamma'] = new Big(10000).minus(new Big(p.fee)).div(new Big(10000));

    }
    let p1 = pools[0];
    let p2 = pools[1];

    if (inputToken === p1.token1Id && middleToken === p1.token2Id) {
        // forward Pool
        p1['reserves'] = {inputToken: new Big(p1.token1Supply),
                          middleToken: new Big(p1.token2Supply)};
        } else if (middleToken === p1.token1Id && inputToken === p1.token2Id) {
            //reverse pool
            p1['reserves'] = {middleToken: new Big(p1.token1Supply),
                              inputToken: new Big(p1.token2Supply)};
    }

    if (middleToken === p2.token1Id && outputToken === p2.token2Id) {
        // forward Pool
        p2['reserves'] = {middleToken: new Big(p2.token1Supply),
                          outputToken: new Big(p2.token2Supply)};
        } else if (outputToken === p2.token1Id && middleToken === p2.token2Id) {
            //reverse pool
            p2['reserves'] = {outputToken: new Big(p2.token1Supply),
                              middleToken: new Big(p2.token2Supply)};
    }

    let c1 = new Big(p1.reserves.middleToken);
    let a1 = new Big(p1.reserves.inputToken);
    let c2 = new Big(p2.reserves.middleToken);
    let b2 = new Big(p2.reserves.outputToken);
    let gamma1 = p1.gamma;
    let gamma2 = p2.gamma;
    let num = totalInput.times(c1).times(b2).times(gamma1).times(gamma2);
    let denom = c2.times(a1).plus((totalInput.times((c2.times(gamma1)).plus((c1.times(gamma1).times(gamma2))) )))
    // denom = c2*a1 + totalInput * (c2*gamma1 + c1*gamma1*gamma2)

    return num.div(denom)
}

function getOutputFromRoute(route, nodeRoute, allocation) {
    if (new Big(allocation).eq(new Big(0))) {
        return new Big(0);
    } else {
        let allocation = new Big(allocation);
    }

    if (route.length == 1) {
        // single hop
        let inputToken = nodeRoute[0];
        let outputToken = nodeRoute[1];
        let pool = route[0];
        let output = getOutputSingleHop(pool, inputToken, outputToken, allocation);
    } else if (route.length == 2) {
        // DOUBLE HOP
        let inputToken = nodeRoute[0];
        let middleToken = nodeRoute[1];
        let outputToken = nodeRoute[2];
        let pools = route;
        let output = getOutputDoubleHop(pools,inputToken,middleToken,outputToken, allocation);
    }
    return output;
}

function getOptOutputVec(routes, nodeRoutes, totalInput) {
    let allocations = getOptimalAllocationForRoutes(routes,nodeRoutes,totalInput);
    let result = [];
    for (var i in routes) {
        let route = routes[i];
        let nodeRoute = nodeRoutes[i];
        let allocation = allocations[i];
        let output = getOutputFromRoute(route, nodeRoute, allocation);
        result.push(output);
    }
    return {'result':result,
            'allocations':allocations}
    //NOTE -- I made this return an object instead of the tuple returned in python. need to check the places it is called, and specify 
    // result field instead of tuple 0 position, and allocations field instead of tuple 1 position.
}

function getBestOptOutput(routes, nodeRoutes, totalInput) {
    let outputRefined = getOptOutputVecRefined(routes,nodeRoutes,totalInput).result;
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
    let refDict = getOptOutputVecRefined(routes,nodeRoutes,totalInput);
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
        if (routes[routeInd].length == 1) {
            directRouteInds.push(routeInd);
        }
    }
    if (directRouteInds.length < 1) {
        let allocations = getOptimalAllocationForRoutes(routes, nodeRoutes, totalInput);
        let result = [];
        for (var i in routes) {
            let r = routes[i];
            let nr = nodeRoutes[i];
            let a = allocations[i];
            let output = getOutputFromRoute(r,nr,a);
            result.push(output);
        }
    } else {
        let droutes = [];
        let dnodeRoutes = [];
        for (var dri in directRouteInds) {
            droutes.push(routes[dri]);
            dnodeRoutes.push(nodeRoutes[dri]);
        }
        let dallocations = getOptimalAllocationForRoutes(droutes,dnodeRoutes,totalInput);
        let dallocDict = {}
        for (var dd in dallocations) {
            dallocDict[directRouteInds[dd]] = dallocations[dd];
        }
        let allocations = [];
        for (var ii=0; ii<initLengthRoutes;ii++) {
            if (directRouteInds.includes(ii)) {
                allocations.push(dallocDict[ii]);
            } else {
                allocations.push(new Big(0));
            }
        }
    }
    let result = [];
    for (var j in routes) {
        let route = routes[j];
        let nodeRoute = nodeRoutes[j];
        let allocation = allocations[j];
        let output = getOutputFromRoute(route,nodeRoute,allocation);
        result.push(output);
    }
    return {'result':result,
            'allocations':allocations}
}


// def getOptOutputVecRefined(routes,nodeRoutes,totalInput):
//       
//  
        
//     result = [getOutputFromRoute(r,nr,a) for r,nr,a in zip(routes,nodeRoutes,allocations)]
        
//     return result, allocations






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
    let thresh = new Big(thresh);
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
    return a.reduce((a, b) => a.flatMap((d) => b.map((e) => [ d, e ].flat())));
}