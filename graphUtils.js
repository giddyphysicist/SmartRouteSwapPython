const { assert } = require("console");

function addEdge(g,edge) {
    let src = edge[0];
    let dst = edge[1];
    if (Object.keys(g).includes(src)) {
        if (!Object.keys(g[src]).includes(dst)) {
            g[src][dst] = 1;
        };
    } else {
        g[src]={};
        g[src][dst]=1;
    };
    if (Object.keys(g).includes(dst)) {
        if (!Object.keys(g[dst]).includes(src)) {
            g[dst][src] = 1;
        };
    } else {
        g[dst] = {};
        g[dst][src]=1;
    };
};


function addEdges(g, edgeList) {
    for (var n in edgeList) {
        let edge = edgeList[n];
        //console.log(edge);
        addEdge(g, edge);
    };
};

function deleteEdge(g,edge) {
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

function deleteNode(g,node) {
    let gNew = JSON.parse(JSON.stringify(g)); // using this to deep clone graph structure
    if (Object.keys(gNew).includes(node)) {
        delete gNew[node];
    }
    let keys = Object.keys(gNew)
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
    
    while(true) {
      var parent = null;
      var nearest = null;
      var dist = Infinity;
      
      //for each existing solution
      for(var n in solutions) {
        if(!solutions[n]) {
            solutions[n]={};
        }
        if(!solutions[n].path)
          continue
        var ndist = solutions[n].dist;
        var adj = graph[n];
        //for each of its adjacent nodes...
        for(var a in adj) {
          //without a solution already...
          if(!solutions[a]) {
              solutions[a] = {};
          }
          if(solutions[a].path)
            continue;
          //choose nearest node with lowest *total* cost
          var d = adj[a] + ndist;
          if(d < dist) {
            //reference parent
            parent = solutions[n].path;
            nearest = a;
            dist = d;
          }
        }
      }
      
      //no more solutions
      if(dist === Infinity) {
          break;
      }
      
      //extend parent's solution path
      solutions[nearest].path = parent.concat(nearest);
      //extend parent's cost
      solutions[nearest].dist = dist;
    }
    
    return solutions;
  }

  function shortestPath(g, src, dst,ignore_nodes=[],ignore_edges=[]) {
    let gTemp = JSON.parse(JSON.stringify(g)); // using this to deep clone graph structure
    // remove nodes
    for (var nodeInd in ignore_nodes) {
        let nodeNow = ignore_nodes[nodeInd];
        gTemp = deleteNode(gTemp,nodeNow);
    }
    // remove edges
    for (var edgeInd in ignore_edges) {
        let edgeNow = ignore_edges[edgeInd];
        gTemp = deleteEdge(gTemp,edgeNow);
    }
    let solution = dijkstra(gTemp,src)[dst];
    //console.log('solution is...')
    //console.log(solution)
    // console.log('EFFECTIVE GRAPH IS...')
    // console.log(gTemp)
    // console.log('DIJKSTRA SOLUTION IS...')
    // console.log(solution)
    solution.path.unshift(src); // original algorithm doesn't include source node in path
    return solution
  }



function* count(firstval=0,step=1) {
    let x = firstval;
    while(true) {
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

    push(cost,path) {
        if (!this.paths.includes(path)) {
            this.sortedpaths.push([cost,path]);
            this.sortedpaths.sort(function (a,b) {return a[0]-b[0]})
            //heappush(this.sortedpaths, (cost, this.counter.next().value,path));
            this.paths.push(path);
        }
    }

    pop() {
        //let val = heappop(this.sortedpaths);
        let val = this.sortedpaths.shift();
        console.log('val is ...')
        console.log(val)
        let cost = val[0];
        let path = val[1];
        this.paths.splice((this.paths.indexOf(path)),1);
        return path
    }


}

function arrayEquals(a, b) {
    return Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
}



function* yenFromPy(g,source,target) {
    //adapted from the python implementation in networkx.algorithms.simple_paths.shortest_simple_paths()
  let listA = [];
  let listB = new PathBuffer();
  let prev_path =  null;

  while(true) {
    if (!prev_path) {
        sol = shortestPath(g,source,target);
        let length = sol.dist;
        let path = sol.path;
        listB.push(length,path);
    } else {
      let ignore_nodes = [];
      let ignore_edges = [];
      for (var i=1;i<prev_path.length;i++) {
        let root = prev_path.slice(0,i);
        let root_length = root.length;
        for (var pathInd in listA) {
          let path = listA[pathInd];

          if (arrayEquals(path.slice(0,i),root)) {
              let edgeToIgnore = [path[i-1],path[i]];
              // console.log('edge to ignore is...')
              // console.log(edgeToIgnore)
              ignore_edges.push(edgeToIgnore);
              // console.log('all ignore_edges are...')
              // console.log(ignore_edges)
          }
        }
          try {
                //console.log('trying to get shortest path using ignore_edges...')
                //console.log(ignore_edges)
                let sol = shortestPath(g,root[root.length-1],target,ignore_nodes=ignore_nodes,ignore_edges=ignore_edges);
                let length = sol.dist;
                let spur = sol.path;
                path = root.slice(0,root.length-1).concat(spur);
                listB.push(root_length + length, path);

          } catch {
                console.log('.')
          }
          //console.log('root is now...')
          //console.log(root)
          //console.log('now ignoring node ...')
          // console.log(root[root.length-1])
          ignore_nodes.push(root[root.length-1]);

        

      }
    }
    if (listB) {
        // console.log(listB)
        // for (var ii=0; ii<listB.sortedpaths.length;ii++) {
        //     console.log(listB.sortedpaths[ii][1])
        // }
        let path = listB.pop();
        //  console.log('path is...')
        //  console.log(path)
        yield path;
        listA.push(path);
        prev_path = path;
    } else {
        break;
    }

}
}

//let g = {'t1':{'t2':1,'t3':1},'t2':{'t3':1},'t3':{'t1':1,'t4':1},'t4':{'t3':1}}

let gg = {};
//let edges = [['t1','t2'],['t1','t3'],['t3','t4']];
let edges = [['c','d'],['c','e'],['d','f'],['e','d'],['e','f'],['e','g'],['f','g'],['f','h'],['g','h']];

//console.log(g);
addEdges(gg,edges);
//console.log(g);
//deleteNode(g,'c');
//console.log(g);

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

gen = yenFromPy(gg,'c','h')
for (let value of gen) {
  console.log(value);
}
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

// console.log(shortestPath(gg,'c','h',[],ignore_edges=[ [ 'c', 'd' ], [ 'c', 'e' ], [ 'e', 'f' ], [ 'f', 'h' ] ]))

//console.log(g)
//console.log(shortestPath(g,'c','h',ignore_nodes=['e'],ignore_edges=[]))
// deleteEdge(g,['c','d']);
// console.log(shortestPath(g,'c','h'))

//let path = shortestPath(g,'c','h').path;
// path.unshift('c');
//console.log(path)

//console.log(null)

// console.log(g);
// deleteEdge(g,['c','d']);
// console.log(g);

// console.log(shortestPath(g,'c','h'))

//let solutions = dijkstra(g,'c');
//console.log(solutions);

//console.log(typeof(solutions['t4'].dist));
//console.log(Object.keys(solutions['t4']));

  // function yen(g, source,sink,K) {
  //   // NOT DONE!!!
  //   assert(false)
  //   //copy graph into temp graph structure
  //   let tempG =JSON.parse(JSON.stringify(g)); // using this to deep clone graph structure
  //   let A = [];
  //   A.push(dijkstra(tempG,source)[sink]);
  //   let B = [];
  //   for (var k=1;k<=K;k++) {
  //       for (var i=0;i<A[k-1].length-2;i++) {
  //           let spurNode=A[k-1].path[i];
  //           let rootPath=A[k-1].path.slice(0,i);

  //           for(var pathInd in A) {
  //               let p = A[pathInd];
  //               if (rootPath === p.path.slice(0,i)) {

  //               }
  //           }

  //       }
  //   }


  // };