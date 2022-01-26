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
    let e1 = edge[0];
    let e2 = edge[1];
    if (Object.keys(g).includes(e1)) {
        if (Object.keys(g[e1]).includes(e2)) {
            delete g[e1][e2];
        }
    }
    if (Object.keys(g).includes(e2)) {
        if (Object.keys(g[e2]).includes(e1)) {
            delete g[e2][e1];
        }
    }
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

  function shortestPath(g, src, dst) {
    let solution = dijkstra(g,src)[dst];
    solution.path.unshift(src); // original algorithm doesn't include source node in path
    return solution
  }

  function yen(g, source,sink,K) {
    // NOT DONE!!!
    assert(false)
    //copy graph into temp graph structure
    let tempG = Object.assign({},g);
    let A = [];
    A.push(dijkstra(g,source)[sink]);
    let B = [];
    for (var k=1;k<=K;k++) {
        for (var i=0;i<A[k-1].length-2;i++) {
            let spurNode=A[k-1].path[i];
            let rootPath=A[k-1].path.slice(0,i);

            for(var pathInd in A) {
                let p = A[pathInd];
                if (rootPath === p.path.slice(0,i)) {

                }
            }

        }
    }


  };



function yenFromPy(g,source,target) {
  let listA = [];
  let listB = PathBuffer();
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
      for (var i=1;i<=prev_path.length;i++) {
        let root = prev_path.slice(i);
        let root_length = root.length;
        for (pathInd in listA) {
          let path = listA[pathInd];
          if (path.slice(i)===root) {
            ignore_edges.push([path[i-1],path[i]]);
            
          }
        }

      }
    }
  }
}

//let g = {'t1':{'t2':1,'t3':1},'t2':{'t3':1},'t3':{'t1':1,'t4':1},'t4':{'t3':1}}

let g = {};
//let edges = [['t1','t2'],['t1','t3'],['t3','t4']];
let edges = [['c','d'],['c','e'],['d','f'],['e','d'],['f','g'],['f','h'],['g','h']];

//console.log(g);
addEdges(g,edges);
//console.log(g);
console.log(shortestPath(g,'c','h'))

let path = shortestPath(g,'c','h').path;
// path.unshift('c');
console.log(path)

console.log(null.length)

// console.log(g);
// deleteEdge(g,['c','d']);
// console.log(g);

// console.log(shortestPath(g,'c','h'))

//let solutions = dijkstra(g,'c');
//console.log(solutions);

//console.log(typeof(solutions['t4'].dist));
//console.log(Object.keys(solutions['t4']));