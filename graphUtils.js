const { assert } = require('console');
const {performance} = require('perf_hooks');


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
            sol = shortestPath(g, source, target);
            let length = sol.dist;
            let path = sol.path;
            listB.push(length, path);
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
                    path = root.slice(0, root.length - 1).concat(spur);
                    listB.push(root_length + length, path);
                } catch (e) {
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

function getAllPathsBelowLengthN(g, source, target, N, limit = 1000) {
    // use Yen's algorithm to find the paths of length N or below between source and target nodes in graph g.
    let paths = [];
    let gen = yenFromPy(g, source, target);
    let currentPathLength = 0;
    let count = 1;
    while (currentPathLength <= N) {
        try {
            let res = gen.next().value;
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
            break;
        }
    }
    return paths;
}

//TODO:
// port python lagrange algorithm
// import pools from Ref UI.
// create interface functions
//  -- create graph object from list of pools.

// TO ADD TO src/store/RefDatabase.ts as a method following the queryPoolsByTokens() method on line 268
/*
async queryPoolsToken1OrToken2(tokenInId: string, tokenOutId: string) {
  let normalItems1 = await this.poolsTokens
    .where('token1Id')
    .equals(tokenInId.toString())
    .toArray();
  let normalItems2 = await this.poolsTokens
    .where('token1Id')
    .equals(tokenOutId.toString())
    .toArray();
  let reverseItems1 = await this.poolsTokens
    .where((item) => item.token2Id === tokenInId.toString())
    .toArray();
  let reverseItems2 = await this.poolsTokens
    .where((item) => item.token2Id === tokenOutId.toString())
    .toArray();

   //note, there might be some overlap... we'll need to remove the duplicates.
  let dup = [...normalItems1, ...normalItems2, ...reverseItems1, ...reverseItems2];
  // First try this:
  let result = [... new Set(dup.map(JSON.stringify))].map(JSON.parse);
 // next try this:
  let result = [];
  let resultJson = [];
  for (n in dup) {
    let item = dup[n];
    let itemJson = JSON.stringify(item); // using stringify with JSON to test object inclusion.
    if (!resultJson.includes(itemJson)) {
      result.push(item);
      resultJson.push(itemJson);
    }
  }
  return result;
}


In src/services/pool.ts, need to add function to get pools containing token1 OR token2, after getPoolByToken function on line 67:

export const getPoolsByToken1ORToken2 = async (tokenId1: string,tokenId2: string) => {
  return await db.queryPoolsToken1OrToken2(tokenId1, tokenId2);
};

*/
////////////////////////////////////////////////////////////////////////

// TESTING

////////////////////////////////////////////////////////////////////////

//let g = {'t1':{'t2':1,'t3':1},'t2':{'t3':1},'t3':{'t1':1,'t4':1},'t4':{'t3':1}}
// let start = performance.now();
let gg = {};
//let edges = [['t1','t2'],['t1','t3'],['t3','t4']];
let edges = [
    [ 'c', 'd' ],
    [ 'c', 'e' ],
    [ 'd', 'f' ],
    [ 'e', 'd' ],
    [ 'e', 'f' ],
    [ 'e', 'g' ],
    [ 'f', 'g' ],
    [ 'f', 'h' ],
    [ 'g', 'h' ]
];

addEdges(gg, edges);

// let g = JSON.parse(JSON.stringify(gg));
// console.log(g)
// console.log(gg)
// gg = deleteEdge(gg,['c','d'])
// console.log(g)
// console.log(gg)

// console.log(shortestPath(gg,'c','h'))
// console.log(shortestPath(gg,'c','h',ignore_nodes=[],ignore_edges=[['c','d']]))
// console.log(shortestPath(gg,'c','h'))
// console.log(shortestPath(gg,'c','h',ignore_nodes=['f'],ignore_edges=[]))

// gen = yenFromPy(gg,'c','h')
// for (let value of gen) {
//   console.log(value);
// }

//console.log([...yenFromPy(gg,'c','h')])

// function arrayContains2(arr, obj) {
//  // checks to see if the input array contains a reference object, obj, using
//  // JSON.stringify() .
//  let obj_json = JSON.stringify(obj);
//  return arr.map(JSON.stringify).includes(obj_json);
// }

//console.log(getKShortestPaths(gg, 'c', 'h', 18));
console.log(getAllPathsBelowLengthN(gg, 'c', 'h', 7));

// var end = performance.now();
// var duration = end - start;

// console.log(`Code took ${duration} milli-seconds to run`);
// console.log(`Code took ${duration / 1000} seconds to run`);

// console.log(gen.next())
// console.log('==================================')
// console.log(gen.next())
// console.log('==================================')
// console.log(gen.next())
// console.log('==================================')
// console.log('==================================')
// console.log(gen.next())
// console.log('==================================')
// console.log('==================================')
// console.log(gen.next())
// console.log('==================================')
// console.log('==================================')
// console.log(gen.next())
// console.log('==================================')
// console.log('==================================')
// console.log(gen.next())