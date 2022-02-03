# -*- coding: utf-8 -*-
"""SmartRouteLagrange.ipynb


# Lagrange Method for Smart Routing

## Initialize Near protocol parameters
"""

#Beginning methods were borrowed/adapted from Marco's index-helper code base on Ref-UI


try:
    from rpc_info import TESTNET_RPC_URL, MAINNET_RPC_URL
except ImportError:
    TESTNET_RPC_URL= ["https://rpc.testnet.near.org", ]
    MAINNET_RPC_URL= ["https://rpc.mainnet.near.org", ]

try:
    from indexer_info import INDEXER_DSN, INDEXER_UID, INDEXER_PWD, INDEXER_HOST, INDEXER_PORT
except ImportError:
    INDEXER_DSN = "mainnet_explorer"
    INDEXER_UID = "public_readonly"
    INDEXER_PWD = "nearprotocol"
    INDEXER_HOST = "104.199.89.51"
    INDEXER_PORT = "5432"

"""## Set up Ref Coin database for both mainnet and testnet"""

"""

"""

class Cfg:
    NETWORK_ID = "MAINNET"
    NETWORK = {
        "TESTNET": {
            "NEAR_RPC_URL": TESTNET_RPC_URL,
            "FARMING_CONTRACT": "v2.ref-farming.testnet",
            "REF_CONTRACT": "ref-finance-101.testnet",
            "REDIS_KEY": "FARMS_TESTNET",
            "REDIS_POOL_KEY": "POOLS_TESTNET",
            "REDIS_POOL_BY_TOKEN_KEY": "POOLS_BY_TOKEN_TESTNET",
            "REDIS_TOP_POOL_KEY": "TOP_POOLS_TESTNET",
            "REDIS_TOKEN_PRICE_KEY": "TOKEN_PRICE_TESTNET",
            "REDIS_TOKEN_METADATA_KEY": "TOKEN_METADATA_TESTNET",
            "REDIS_WHITELIST_KEY": "WHITELIST_TESTNET",
            "INDEXER_DSN": "testnet_explorer",
            "INDEXER_UID": "public_readonly",
            "INDEXER_PWD": "nearprotocol",
            "INDEXER_HOST": "35.184.214.98",
            "INDEXER_PORT": "5432",
        },
        "MAINNET": {
            "NEAR_RPC_URL": MAINNET_RPC_URL,
            "FARMING_CONTRACT": "v2.ref-farming.near",
            "REF_CONTRACT": "v2.ref-finance.near",
            "REDIS_KEY": "FARMS_MAINNET",
            "REDIS_POOL_BY_TOKEN_KEY": "POOLS_BY_TOKEN_MAINNET",
            "REDIS_POOL_KEY": "POOLS_MAINNET",
            "REDIS_TOP_POOL_KEY": "TOP_POOLS_MAINNET",
            "REDIS_TOKEN_PRICE_KEY": "TOKEN_PRICE_MAINNET",
            "REDIS_TOKEN_METADATA_KEY": "TOKEN_METADATA_MAINNET",
            "REDIS_WHITELIST_KEY": "WHITELIST_MAINNET",
            "INDEXER_DSN": INDEXER_DSN,
            "INDEXER_UID": INDEXER_UID,
            "INDEXER_PWD": INDEXER_PWD,
            "INDEXER_HOST": INDEXER_HOST,
            "INDEXER_PORT": INDEXER_PORT,
        }
    }
    TOKENS = {
        "TESTNET": [
            {"SYMBOL": "near", "NEAR_ID": "wrap.testnet", "MD_ID": "near", "DECIMAL": 24},
            {"SYMBOL": "nDAI", "NEAR_ID": "ndai.ft-fin.testnet", "MD_ID": "dai", "DECIMAL": 8},
            {"SYMBOL": "nUSDT", "NEAR_ID": "nusdt.ft-fin.testnet", "MD_ID": "tether", "DECIMAL": 6},
            {"SYMBOL": "ref", "NEAR_ID": "rft.tokenfactory.testnet", "MD_ID": "ref-finance.testnet|24|wrap.testnet", "DECIMAL": 8},
        ],
        "MAINNET": [
            {"SYMBOL": "near", "NEAR_ID": "wrap.near", "MD_ID": "near", "DECIMAL": 24},
            {"SYMBOL": "nUSDC", "NEAR_ID": "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near", "MD_ID": "usd-coin", "DECIMAL": 6},
            {"SYMBOL": "nUSDT", "NEAR_ID": "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near", "MD_ID": "tether", "DECIMAL": 6},            
            {"SYMBOL": "nDAI", "NEAR_ID": "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near", "MD_ID": "dai", "DECIMAL": 18},
            {"SYMBOL": "nWETH", "NEAR_ID": "c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.factory.bridge.near", "MD_ID": "weth", "DECIMAL": 18},
            {"SYMBOL": "n1INCH", "NEAR_ID": "111111111117dc0aa78b770fa6a738034120c302.factory.bridge.near", "MD_ID": "1inch", "DECIMAL": 18},
            {"SYMBOL": "nGRT", "NEAR_ID": "c944e90c64b2c07662a292be6244bdf05cda44a7.factory.bridge.near", "MD_ID": "the-graph", "DECIMAL": 18},
            {"SYMBOL": "SKYWARD", "NEAR_ID": "token.skyward.near", "MD_ID": "v2.ref-finance.near|0|wrap.near", "DECIMAL": 18},
            {"SYMBOL": "REF", "NEAR_ID": "token.v2.ref-finance.near", "MD_ID": "v2.ref-finance.near|79|wrap.near", "DECIMAL": 18},
            {"SYMBOL": "BANANA", "NEAR_ID": "berryclub.ek.near", "MD_ID": "v2.ref-finance.near|5|wrap.near", "DECIMAL": 18},
            {"SYMBOL": "nHT", "NEAR_ID": "6f259637dcd74c767781e37bc6133cd6a68aa161.factory.bridge.near", "MD_ID": "huobi-token", "DECIMAL": 18},
            {"SYMBOL": "nGTC", "NEAR_ID": "de30da39c46104798bb5aa3fe8b9e0e1f348163f.factory.bridge.near", "MD_ID": "gitcoin", "DECIMAL": 18},
            {"SYMBOL": "nUNI", "NEAR_ID": "1f9840a85d5af5bf1d1762f925bdaddc4201f984.factory.bridge.near", "MD_ID": "uniswap", "DECIMAL": 18},
            {"SYMBOL": "nWBTC", "NEAR_ID": "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near", "MD_ID": "wrapped-bitcoin", "DECIMAL": 8},
            {"SYMBOL": "nLINK", "NEAR_ID": "514910771af9ca656af840dff83e8264ecf986ca.factory.bridge.near", "MD_ID": "chainlink", "DECIMAL": 18},
            {"SYMBOL": "PARAS", "NEAR_ID": "token.paras.near", "MD_ID": "v2.ref-finance.near|377|wrap.near", "DECIMAL": 18},
            {"SYMBOL": "STNEAR", "NEAR_ID": "meta-pool.near", "MD_ID": "v2.ref-finance.near|535|wrap.near", "DECIMAL": 24},
            {"SYMBOL": "marmaj", "NEAR_ID": "marmaj.tkn.near", "MD_ID": "v2.ref-finance.near|11|wrap.near", "DECIMAL": 18},
            {"SYMBOL": "PULSE", "NEAR_ID": "52a047ee205701895ee06a375492490ec9c597ce.factory.bridge.near", "MD_ID": "v2.ref-finance.near|852|wrap.near", "DECIMAL": 18},
            {"SYMBOL": "ETH", "NEAR_ID": "aurora", "MD_ID": "ethereum", "DECIMAL": 18},
            {"SYMBOL": "AURORA", "NEAR_ID": "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near", "MD_ID": "v2.ref-finance.near|1395|wrap.near", "DECIMAL": 18},
        ],
    }
    MARKET_URL = "api.coingecko.com"

import requests
import base64
import json
import networkx as nx
# import nxviz as nv
import itertools
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from decimal import Decimal


#from config import Cfg

REF_CONTRACT = 'v2.ref-finance.near'
FARMING = 'v2.ref-farming.near'
INDEXER_URL = 'https://indexer.ref-finance.net'

class MultiNodeJsonProviderError(Exception):
    pass

# Adapted from Marco's index-helper code base on Ref-UI
class MultiNodeJsonProvider(object):
    def __init__(self, network_id):
        nodes = Cfg.NETWORK[network_id]["NEAR_RPC_URL"]
        best_height = 0
        best_node = None
        for node in nodes:
            self._rpc_addr = node
            node_status = self.ping_node()
            print(node, node_status)
            if not node_status['syncing'] and node_status['latest_block_height'] > best_height + 10:
                best_height = node_status['latest_block_height']
                best_node = node
        if best_node is not None:
            print("Choose near rpc node", best_node)
            self._rpc_addr = best_node
        else:
            raise MultiNodeJsonProviderError("No available nodes")

    def rpc_addr(self):
        return self._rpc_addr

    def json_rpc(self, method, params, timeout=2):
        j = {
            'method': method,
            'params': params,
            'id': 'dontcare',
            'jsonrpc': '2.0'
        }
        r = requests.post(self.rpc_addr(), json=j, timeout=timeout)
        r.raise_for_status()
        content = json.loads(r.content)
        if "error" in content:
            raise MultiNodeJsonProviderError(content["error"])
        return content["result"]

    def send_tx(self, signed_tx):
        return self.json_rpc('broadcast_tx_async', [base64.b64encode(signed_tx).decode('utf8')])

    def send_tx_and_wait(self, signed_tx, timeout):
        return self.json_rpc('broadcast_tx_commit', [base64.b64encode(signed_tx).decode('utf8')], timeout=timeout)

    def get_status(self):
        # r = requests.get("%s/status" % self.rpc_addr(), timeout=2)
        # r.raise_for_status()
        # return json.loads(r.content)
        return self.json_rpc('status', [None])

    def get_validators(self):
        return self.json_rpc('validators', [None])

    def query(self, query_object):
        return self.json_rpc('query', query_object)

    def get_account(self, account_id, finality='optimistic'):
        return self.json_rpc('query', {"request_type": "view_account", "account_id": account_id, "finality": finality})

    def get_access_key_list(self, account_id, finality='optimistic'):
        return self.json_rpc('query', {"request_type": "view_access_key_list", "account_id": account_id, "finality": finality})

    def get_access_key(self, account_id, public_key, finality='optimistic'):
        return self.json_rpc('query', {"request_type": "view_access_key", "account_id": account_id,
                                       "public_key": public_key, "finality": finality})

    def view_call(self, account_id, method_name, args, finality='optimistic'):
        return self.json_rpc('query', {"request_type": "call_function", "account_id": account_id,
                                       "method_name": method_name, "args_base64": base64.b64encode(args).decode('utf8'), "finality": finality})

    def get_block(self, block_id):
        return self.json_rpc('block', [block_id])

    def get_chunk(self, chunk_id):
        return self.json_rpc('chunk', [chunk_id])

    def get_tx(self, tx_hash, tx_recipient_id):
        return self.json_rpc('tx', [tx_hash, tx_recipient_id])

    def get_changes_in_block(self, changes_in_block_request):
        return self.json_rpc('EXPERIMENTAL_changes_in_block', changes_in_block_request)

    def ping_node(self):
        ret = {'latest_block_height': 0, 'syncing': True}

        try:
            status = self.get_status()
            if "sync_info" in status:
                ret['latest_block_height'] = status['sync_info']['latest_block_height']
                ret['syncing'] = status['sync_info']['syncing']
        except MultiNodeJsonProviderError as e:
            print("ping node MultiNodeJsonProviderError: ", e)
        except Exception as e:
            print("ping node Exception: ", e)
   
        return ret
   
    def view_call_readable(self, account_id, method_name, args, finality='optimistic'):
      """utitlity function for converting view functions binary outputs in to a 
      human-readable python dictionary format"""
      ret = self.view_call(account_id,method_name,args,finality=finality)
      b = "".join([chr(x) for x in ret["result"]])
      obj = json.loads(b)
      return obj
      
conn = MultiNodeJsonProvider("MAINNET")

"""## Ref-Finance Utility Functions"""

def getTokenMetadata(tokenContract):
    return conn.view_call_readable(tokenContract, 'ft_metadata',b'{}')

def getPool(poolId,refContract=REF_CONTRACT):
    argString = f'{{"pool_id":{poolId}}}'
    return conn.view_call_readable(refContract, 'get_pool', argString.encode('utf-8'))

def getPools(from_index=0,limit=100,refContract=REF_CONTRACT):
    argString = f'{{"from_index":{from_index},"limit":{limit}}}'    
    return conn.view_call_readable(refContract, 'get_pools', argString.encode('utf-8'))

def getPoolShares(poolId,accountId,refContract=REF_CONTRACT):
    argString = f'{{"pool_id":{poolId}, "account_id":"{accountId}"}}'
    return conn.view_call_readable(refContract, 'get_pool_shares', argString.encode('utf-8'))

def getPoolTotalShares(poolId,refContract=REF_CONTRACT):
    argString = f'{{"pool_id":{poolId}}}'
    return conn.view_call_readable(refContract, 'get_pool_total_shares', argString.encode('utf-8'))

def getNumberOfPools(refContract=REF_CONTRACT):
    return conn.view_call_readable(refContract, 'get_number_of_pools', b'{}')

def getUserDeposits(accountId, refContract=REF_CONTRACT):
    argString = f'{{"account_id":"{accountId}"}}'
    return conn.view_call_readable(refContract, 'get_deposits', argString.encode('utf-8'))

"""## Ref Network, Graph, and Pool Functions"""

def getAllPools(refContract=REF_CONTRACT):
  """Iterates over all pools and returns data structures for current characteristics
  of each pool using the build-in Ref Finance contract function. 

  Adds attributes for pool ID and pool reserves (a key-value pairing of token 
  contract to the reserves in the pool)
  """
  pools = []
  numberOfPools = getNumberOfPools(refContract)
  from_index = 0
  delta = 400
  while from_index < numberOfPools:
      additionalPools = getPools(from_index,limit=delta)
      pools.extend(additionalPools)
      from_index += delta
  for i,pool in enumerate(pools):
      pool['id'] = i
      pool['reserves'] = {pool['token_account_ids'][i]:pool['amounts'][i] for i in range(len(pool['token_account_ids']))}
                          # pool['token_account_ids'][1]:pool['amounts'][1]}
      
  return pools

def getAllNonzeroPools(pools=None,refContract=REF_CONTRACT):
  '''Filter out the pools that contain 0 reserves of at least one token.

  Return a list of pool structs.
  '''
  if pools is None:
      pools = getAllPools(refContract)
  nzPools = [p for p in pools if '0' not in p['amounts']]
  return nzPools

def plotGraphOfPools(pools=None, transitions = None):
    if transitions is None:
        transitions = getTransitions(pools)
    g = nx.Graph()
    g.add_edges_from(transitions)
    plt.figure()
    nx.draw_kamada_kawai(g, with_labels=True)

def plotNetwork(pools=None, refContract = REF_CONTRACT):
  """ Plot the graph of the Ref Finance network. 
  Tokens are represented by nodes in the graph, and 2-token swap pools are 
  represented by edges between the nodes.
  """
  if  pools is None:      
      pools = getAllNonzeroPools(refContract=refContract)
      pools = [p for p in pools if len(p['token_account_ids'])==2] #ignore non-pair-pools for now
  transitions = [(getTokenMetadata(p['token_account_ids'][0])['symbol'],
                  getTokenMetadata(p['token_account_ids'][1])['symbol']) for p in pools]
  g = nx.Graph()
  g.add_edges_from(transitions)
  nx.draw_circular(g,with_labels=True)
  return g
  #nv.CircosPlot(g)

def getShortestPath(token1, token2, pools=None, g = None, refContract = REF_CONTRACT):
  """calculates up to 30 of the shortest paths between input tokens 'token1' and 
  'token2'. 
  """
  if  pools is None:      
      pools = getAllNonzeroPools(refContract=refContract)
      pools = [p for p in pools if len(p['token_account_ids'])==2]
  if g is None:
      g = getGraph(getTransitions(pools))
  try:
      gen = nx.algorithms.simple_paths.shortest_simple_paths(g,token1,token2)
      shortestPath = list(itertools.islice(gen, 30))
  except:
      print(f'NO PATH EXISTS BETWEEN TOKENS {token1} and {token2}')
      shortestPath = []
  return shortestPath

def getTransitions(pools=None, refContract = REF_CONTRACT):
  """Given a list of pools, this function iterates over the pools containing 
  two types of tokens and returns a list of lists of token pairs. 
  """
  if pools is None:
      pools = getAllNonzeroPools(refContract=refContract)
  pairPools = [p for p in pools if len(p['token_account_ids'])==2]
  otherPools = [p for p in pools if p not in pairPools]
  transitions = [p['token_account_ids'] for p in pairPools]
  for p in otherPools:
      # enumerate pairings for larger pools, such as tri-pools
      #transitions.extend(list(itertools.combinations(p['token_account_ids'],2)))
      pass
  return transitions

def getGraph(transitions):
  """Given a list of transition pairs, this function builds an undirected graph
  obect. 
  """
  g = nx.Graph()
  g.add_edges_from(transitions)
  return g

def getAllPaths(pools=None,g=None,refContract = REF_CONTRACT):
    if  pools is None:      
        pools = getAllNonzeroPools(refContract=refContract)
        pools = [p for p in pools if len(p['token_account_ids'])==2]
    if g is None:
        g = getGraph(getTransitions(pools))
    tokens = getAllTokens(pools, refContract)
    paths = []
    for i,token1 in enumerate(tokens):
        print(i/len(tokens)*100)
        for j,token2 in enumerate(tokens):
            if j>i:
                path = getShortestPath(token1, token2, pools, g)
                if path:
                    paths.append(path)
    return paths

def getAllTokens(pools=None,refContract = REF_CONTRACT):
  """Given a list of pools, this function returns a list of all the unique 
  token contract names.
  """
  if pools is None:
      pools = getAllNonzeroPools(refContract=refContract)
  tokens = []
  for p in pools:
      for t in p['token_account_ids']:
          if t not in tokens:
              tokens.append(t)
  return tokens

def getShortestPathLengthMatrix(pools=None,g=None,refContract=REF_CONTRACT):
  """Build a shortest-path-length matrix between each pair of pools. 
  """
  if  pools is None:      
      pools = getAllNonzeroPools(refContract=refContract)
      pools = [p for p in pools if len(p['token_account_ids'])==2]
  if g is None:
      g = getGraph(getTransitions(pools))
  tokens = getAllTokens(pools, refContract)
  matrix = np.zeros((len(tokens),len(tokens)))
  
  for i,token1 in enumerate(tokens):
      print(i/len(tokens)*100)
      for j,token2 in enumerate(tokens):
          if j!=i:
              if nx.algorithms.has_path(g,token1,token2):
                  matrix[i,j] = nx.shortest_paths.shortest_path_length(g,token1, token2)
              else:
                  matrix[i,j] = np.inf
  return matrix

def getPathLengthStatsFromShortestPathMatrix(m):
  """Store a frequency dictionary of the number of times a particular minimum
  number of hops occurs for a given pair of tokens in the input shortest path
  matrix. 
  """
  data = list(m.flatten())
  d = {0:data.count(0)} # get the direct number of 0-hops
  d.update({i:data.count(i)//2 for i in range(1,5)}) #divide other occurrences by 2 due to double-counting (A-->B and B-->A are counted as two separate occurrences. This corrects that.)
  return d

def getPoolsWithToken(pools=None, token=None, refContract=REF_CONTRACT):
  """Get a list of only the pools that contain a given input token. 
  """
  if  pools is None:      
      pools = getAllNonzeroPools(refContract=refContract)
  tpools = [p for p in pools if token in p['token_account_ids']]
  return tpools

def getPoolsWithToken1ORToken2(pools=None, token1=None, token2=None, refContract = REF_CONTRACT):
  """Get a list of pools containing token1, token2, or both. 
  """
  fpools = sorted([p for p in pools if (token1 in p['token_account_ids']) or (token2 in p['token_account_ids'])],key=lambda x:x['id'])
      # fpools = [p for p in pools if (token1 in p['token_account_ids']) or (token2 in p['token_account_ids'])]
  return fpools

def getPoolsWithToken1ANDToken2(pools=None, token1=None, token2=None, refContract = REF_CONTRACT):
  '''Get a list of pools containing both token1 and token2.
  '''
  fpools = sorted([p for p in pools if (token1 in p['token_account_ids']) and (token2 in p['token_account_ids'])],key=lambda x:x['id'])
  return fpools

def getDirectPoolNearestNeighborsForToken(pools=None, referenceToken=None):
  """Get a list of the nearest-neighbor tokens relative to referenceToken. That
  is, if there exists a pool in the list of pools which facilitates a direct swap
  between referenceToken and otherToken, add otherToken to the list of direct
  pool nearest neighbors.
  """
  fpools = [p for p in pools if referenceToken in p['token_account_ids']]
  rTokenLinks = []
  for p in fpools:
      rTokenLinks.extend(p['token_account_ids'])
  rTokenLinks = set(rTokenLinks)
  rTokenLinks.remove(referenceToken)
  return rTokenLinks

def getCommonNearestNeighborsForTokens(pools=None, token1=None, token2=None):
  """Given the nearest neighbors of token1 and token2, determine the set intersection
  of the two sets of nearest neighbors. This can be used to determine which tokens
  can act as an intermediary during a double-hop between token1 and token2.
  """
  fpools = getPoolsWithToken1ORToken2(pools, token1,token2)
  t1Pools = [p for p in fpools if token1 in p['token_account_ids']]
  t2Pools = [p for p in fpools if token2 in p['token_account_ids']]
  t1Links = getDirectPoolNearestNeighborsForToken(t1Pools, token1)
  t2Links = getDirectPoolNearestNeighborsForToken(t2Pools, token2)
  commonLinks = t1Links.intersection(t2Links)
  return commonLinks

def getSubgraphForDoubleHop(ps=None, token1=None,token2=None, drawMe=False):
  """ Captures all pools associated with single or double hops and returns the 
  graph object.
  """
  if ps is None:
      ps = getAllNonzeroPools()
  twohoplinks = getCommonNearestNeighborsForTokens(ps, token1, token2)
  directTransitions = getTransitions(getPoolsWithToken1ANDToken2(ps,token1,token2))
  twoHopTransitionsForToken1 = []
  twoHopTransitionsForToken2 = []
  for common in twohoplinks:
      twoHopTransitionsForToken1.extend(getTransitions(getPoolsWithToken1ANDToken2(ps,token1,common)))
      twoHopTransitionsForToken2.extend(getTransitions(getPoolsWithToken1ANDToken2(ps,token2,common)))
  g = nx.Graph()
  g.add_edges_from(directTransitions)
  g.add_edges_from(twoHopTransitionsForToken1)
  g.add_edges_from(twoHopTransitionsForToken2)
  nodes = g.nodes()
  #marker shapes: 'so^>v<dph8'
  node_colors=[]
  for node in nodes:
      if node in [token1,token2]:
          node_colors.append('#98D7C2')
          # node_shapes.append('s')
      else:
          node_colors.append('skyblue')
          # node_shapes.append('o')
  if drawMe:
      plt.figure(figsize=(10,7))
      nx.draw_planar(g,node_color=node_colors,with_labels=True)#,bbox=dict(facecolor="skyblue", edgecolor='black', boxstyle='round,pad=0.2'))
      plt.show()
  return g

def getPathsFromPools(pools=None, token1=None, token2=None):
  """Using the reduced sub-graph limiting to only single and double hops, this 
  function gets the shortest paths and returns them in a list of tokens in order
  for each particular path.
  """
  g = getSubgraphForDoubleHop(pools, token1, token2)
  paths = list(nx.simple_paths.shortest_simple_paths(g, token1,token2))
  return paths

# def solveForPhiFromPaths(paths, totalInput,pools):
#   """Used to solve for lagrange multiplier variable given the particular paths
#   and the total input of initial token. 
#   """
#   betaSum = getBetaSumFromPaths(paths, pools)
#   alphaSum = getAlphaSumFromPaths(paths,pools)
#   phi = (Decimal(totalInput) + betaSum)  /alphaSum
#   return phi

def getPhiFromRoutes(routes,nodeRoutes, totalInput):
  """Solves for lagrange multiplier variable phi given a list of routes. 
  A route is defined as a series of pools in which to make swaps. 
  A node route is defined as a list of tokens, in order, trading from the first 
  token through pools until the last token is reached.
  """
  alphaSum = getAlphaSumFromRoutes(routes, nodeRoutes)
  betaSum = getBetaSumFromRoutes(routes, nodeRoutes)
  # print(totalInput, alphaSum, betaSum)
  phi = (Decimal(totalInput) + betaSum) / alphaSum
  return phi

# def getBetaSumFromPaths(paths, pools):
#     poolChains = getPoolChainFromPaths(paths, pools)
#     routes = getRoutesFromPoolChain(poolChains)
#     nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)
#     betaSum = sum([getBetaForRoute(route, nodeRoute)/getEpsilonForRoute(route, nodeRoute) for route,nodeRoute in zip(routes,nodeRoutes)])
#     return betaSum

# def getAlphaSumFromPaths(paths, pools):
#     poolChains = getPoolChainFromPaths(paths, pools)
#     routes = getRoutesFromPoolChain(poolChains)
#     nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)
#     alphaSum = sum([np.sqrt(getAlphaForRoute(route, nodeRoute))/getEpsilonForRoute(route,nodeRoute) for route,nodeRoute in zip(routes,nodeRoutes)])
#     return alphaSum

def getAlphaSumFromRoutes(routes, nodeRoutes):
    alphaSum = sum([np.sqrt(getAlphaForRoute(route, nodeRoute))/getEpsilonForRoute(route,nodeRoute) for route,nodeRoute in zip(routes,nodeRoutes)])
    return alphaSum

def getBetaSumFromRoutes(routes, nodeRoutes):
    betaSum = sum([getBetaForRoute(route, nodeRoute)/getEpsilonForRoute(route, nodeRoute) for route,nodeRoute in zip(routes,nodeRoutes)])
    return betaSum

def getBetaForRoute(route, path):
    if len(route) == 1:
        #single hop case
        p = route[0]
        beta = Decimal(p['reserves'][path[0]])
    elif len(route) == 2:
        #double hop case
        p1,p2 = route
        beta = Decimal(p1['reserves'][path[0]])*Decimal(p1['reserves'][path[1]]) #??? should there be a p2 in here?
    return beta

def getEpsilonForRoute(route,path):
    if len(route) == 1:
        #single hop case
        p = route[0]
        p['gamma'] = Decimal(Decimal(10000)-Decimal(p['total_fee']))/Decimal(10000)
        epsilon = Decimal(p['gamma'])
    elif len(route) == 2:
        #double hop case
        p1,p2 = route
        p1['gamma'] = (Decimal(10000)-Decimal(p1['total_fee']))/Decimal(10000)
        p2['gamma'] = (Decimal(10000)-Decimal(p2['total_fee']))/Decimal(10000)
        epsilon = Decimal(p2['reserves'][path[1]])*Decimal(p1['gamma']) + Decimal(p1['reserves'][path[1]])*Decimal(p1['gamma'])*Decimal(p2['gamma']) # ??? Is this right?
    return epsilon

def getAlphaForRoute(route,path):
   
    if len(route) == 1:
        #single hop case
        p = route[0]
        inputToken,outputToken = path
       
        p['gamma'] = (Decimal(10000)-Decimal(p['total_fee']))/Decimal(10000)
        alpha = Decimal(p['reserves'][inputToken]) * Decimal(p['reserves'][outputToken]) * Decimal(p['gamma'])
    elif len(route) == 2:
        #double hop case
        p1,p2 = route
        inputToken, middleToken, outputToken = path
        p1['gamma'] = (Decimal(10000)-Decimal(p1['total_fee']))/Decimal(10000)
        p2['gamma'] = (Decimal(10000)-Decimal(p2['total_fee']))/Decimal(10000)
        alpha1 = Decimal(p1['reserves'][inputToken])*Decimal(p1['reserves'][middleToken])*p1['gamma']
        alpha2 = Decimal(p2['reserves'][middleToken])*Decimal(p2['reserves'][outputToken])*p2['gamma']
        alpha = alpha1 * alpha2
    return alpha

def getAllocationForRoute(phi, route, path):
    alpha = getAlphaForRoute(route, path)
    beta = getBetaForRoute(route, path)
    epsilon = getEpsilonForRoute(route, path)
    return (abs(phi)*np.sqrt(alpha)-beta)/epsilon

# def getAllocationVectorForRoutes(phi,routes,paths,poolChains):
#     nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)
#     allocationVec = []
#     for route,path in zip(routes, nodeRoutes):
#         allocationVec.append(getAllocationForRoute(phi, route, path))
#     return allocationVec

def getAllocationVectorForRoutes(phi,routes,nodeRoutes):
    allocationVec = []
    for route,path in zip(routes, nodeRoutes):
        allocationVec.append(getAllocationForRoute(phi, route, path))
    return allocationVec

def getOptimalAllocation(pools, totalInput, inputToken,outputToken):
    paths = getPathsFromPools(pools,inputToken,outputToken)
    poolChains = getPoolChainFromPaths(paths, pools)
    routes = getRoutesFromPoolChain(poolChains)
    nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)
   
    #solve for phi. filter out routes that have negative allocation. resolve for phi
    phi = getPhiFromRoutes(routes, nodeRoutes, totalInput)
    allocations  = getAllocationVectorForRoutes(phi, routes, nodeRoutes)
    # if np.sum(allocations) < 0:
    #     allocations = [Decimal(-1.0) * a for a in allocations]
    if any([a<=0 for a in allocations]):
        allocations = reduceRoutes(routes, nodeRoutes, allocations, totalInput)
    # allocations = reduceRoutes(routes,nodeRoutes,allocations,totalInput)
    sumAllocations = np.abs(np.sum(allocations)) #normalize by expected total delta X to fix floating point rounding errors
    allocations = [x/sumAllocations*Decimal(totalInput) for x in allocations]
    return allocations

def getOptimalAllocationForRoutes(routes, nodeRoutes, totalInput):
    phi = getPhiFromRoutes(routes, nodeRoutes, totalInput)
    allocations = getAllocationVectorForRoutes(phi, routes, nodeRoutes)
    if np.all(np.array(allocations) < 0):
        print('all allocations were <= zero.')
        allocations = [Decimal(-1.0) * a for a in allocations]
    if any([a<=0 for a in allocations]):
        # print(np.sum(np.array(allocations)<=0), ' allocations of ', len(allocations),' are <= zero')
       
        allocations = reduceRoutes(routes, nodeRoutes, allocations, totalInput)
    sumAllocations = np.sum(allocations) #normalize by expected total delta X to fix floating point rounding errors
    allocations = [x/sumAllocations*Decimal(totalInput) for x in allocations]
    return allocations

def reduceRoutes(routes,nodeRoutes,allocationVec,totalInput):

    goodIndices = []
    for i,dx in enumerate(allocationVec):
       if dx > 0:
           goodIndices.append(i)
    newRoutes = [routes[i] for i in range(len(routes)) if i in goodIndices]
    newNodeRoutes = [nodeRoutes[i] for i in range(len(routes)) if i in goodIndices]
    # phi = getPhiFromRoutes(newRoutes, newNodeRoutes, totalInput)
    allocationVec = getOptimalAllocationForRoutes(newRoutes,newNodeRoutes,totalInput)
    allocationDict = dict(zip(goodIndices,allocationVec))
    allocationVecNew = []
    for i in range(len(routes)):
        if i in goodIndices:
            allocationVecNew.append(allocationDict[i])
        else:
            allocationVecNew.append(Decimal(0))
    return allocationVecNew

def getNodeRoutesFromPathsAndPoolChains(paths, poolChains):
    multiplicity = [np.prod([len(y) for y in x]) for x in poolChains]
    nodeRoutes = []
    for path, m in zip(paths,multiplicity):
        for i in range(m):
            nodeRoutes.append(path)
    return nodeRoutes

def getLiquidityOfPoolsFromList(pools):
  liquidities = []
  for pool in pools:
    liquidity = np.prod([Decimal(x) for x in pool['amounts']])
    liquidities.append(liquidity)
  return liquidities

def getNormalizedLiquiditiesFromList(pools):
  liq = getLiquidityOfPoolsFromList(pools)
  return [v/np.max(liq) for v in liq]

def cullPoolsWithInsufficientLiquidity(pools,threshold=0.001):
  normLiq = getNormalizedLiquiditiesFromList(pools)
  remPools = [p for i,p in enumerate(pools) if normLiq[i]>threshold]
  return remPools


def getCulledPoolChains(poolChains,threshold=0.001):
  newChains = []
  for path in poolChains:
    newPath = []
    for leg in path:
      culledPath = cullPoolsWithInsufficientLiquidity(leg,threshold)
      newPath.append(culledPath)
    newChains.append(newPath)
  return newChains


def getPoolChainFromPaths(paths,pools,cull=True,threshold=0.00):
  '''if cull is true, this will prune out parallel pools at a given hop stage that
  do not have a relative liquidity above a certain threshold.'''
  poolChains = []
  for path in paths:
      chain = []
      pairs = [path[i:i+2] for i in range(len(path)-1)]
      for pair in pairs:
          tokenPools = getPoolsWithToken1ANDToken2(pools,pair[0],pair[1])
          chain.append(tokenPools)
      poolChains.append(chain)
  # if any([len(c)==1 for c in pc]): #direct swap case
  #   #cull to direct swap?
  #   poolChains = 
  if cull:
    poolChains = getCulledPoolChains(poolChains,threshold)
  return poolChains


def getRoutesFromPoolChain(poolChains):
    routes = []
    for poolChain in poolChains:
        #get cartesian product of each pool chain to get the list of routes.
        newRoutes = itertools.product(*poolChain)
        routes.extend(newRoutes)
    return routes


def getOutputSingleHop(pool, inputToken, outputToken, totalInput):
    totalInput = Decimal(totalInput)
    if 'gamma' not in pool:
        pool['gamma'] = (Decimal(10000)-Decimal(pool['total_fee']))/Decimal(10000)
    num = totalInput * pool['gamma'] * Decimal(pool['reserves'][outputToken])
    denom = Decimal(pool['reserves'][inputToken]) + totalInput * pool['gamma']
    return num/denom


def getOutputDoubleHop(pools, inputToken, middleToken, outputToken, totalInput):
    totalInput = Decimal(totalInput)
    for p in pools:
        if 'gamma' not in p:
            p['gamma'] = (Decimal(10000)-Decimal(p['total_fee']))/Decimal(10000)
    p1,p2 = pools
    c1 = Decimal(p1['reserves'][middleToken])
    a1 = Decimal(p1['reserves'][inputToken])
    c2 = Decimal(p2['reserves'][middleToken])
    b2 = Decimal(p2['reserves'][outputToken])
     
    gamma1 = p1['gamma']
    gamma2 = p2['gamma']
    num = totalInput * c1 * b2 * gamma1 * gamma2
    #Decimal(p1['reserves'][middleToken]) *Decimal(p2['reserves'][outputToken]) * p1['gamma'] * p2['gamma']
    denom = c2*a1 + totalInput * (c2*gamma1 + c1*gamma1*gamma2)
    #denom = Decimal(p1['reserves'][inputToken]) * Decimal(p2['reserves'][middleToken])

    #denom = denom + totalInput * (p1['gamma'] * c2 + p1['gamma']*p2['gamma']*c1)
    return num / denom


def getOutputFromRoute(route, nodeRoute, allocation):
    if Decimal(allocation) == Decimal(0):
        return Decimal(0)
    if len(route) == 1:
        #single hop
        inputToken, outputToken = nodeRoute
        pool = route[0]
        output = getOutputSingleHop(pool, inputToken, outputToken, allocation)
       
    elif len(route) == 2:
        #double hop
        inputToken, middleToken, outputToken = nodeRoute
        pools = route
        output = getOutputDoubleHop(pools, inputToken, middleToken, outputToken, allocation)
    return output


def testRandomInputs(routes, nodeRoutes, totalInput,N = 100):
    vvals = []
    outputVals = []
    for i in range(N):
        vraw = np.random.rand(len(routes),)
        v = vraw / np.sum(vraw) * totalInput
        vvals.append(v)
        outputVals.append(np.sum([getOutputFromRoute(r,nr,a) for r,nr,a in zip(routes,nodeRoutes,v)]))
    return vvals, outputVals


def getOptOutputVec(routes,nodeRoutes,totalInput):
    allocations = getOptimalAllocationForRoutes(routes,nodeRoutes,totalInput)
    result = [getOutputFromRoute(r,nr,a) for r,nr,a in zip(routes,nodeRoutes,allocations)]
    return result, allocations


def getOptOutput(routes, nodeRoutes, totalInput, refined=False):
    if refined:
        func = getOptOutputVecRefined
    else:
        func = getOptOutputVec
    return np.sum(func(routes,nodeRoutes,totalInput))


def getBestOptOutput(routes, nodeRoutes, totalInput):
    res1 = np.sum(getOptOutputVecRefined(routes,nodeRoutes,totalInput)[0])
    res2 = np.sum(getOptOutputVec(routes,nodeRoutes,totalInput)[0])
    return max(res1,res2)


def getBestOptInput(routes, nodeRoutes, totalInput):
    outputsRef,inputsRef =  getOptOutputVecRefined(routes,nodeRoutes,totalInput)
    outputs,inputs = getOptOutputVec(routes,nodeRoutes,totalInput)
    if np.sum(outputsRef) > np.sum(outputs):
        return inputsRef
    else:
        return inputs


def getOptOutputVecRefined(routes,nodeRoutes,totalInput):
    initLengthRoutes = len(routes)
    directRouteInds = [i for i,r in enumerate(routes) if len(r)==1]
    if not directRouteInds:
        # print('WARNING -- NO DIRECT ROUTES FOUND...')
        # print('RETURNING FULL RESULT.')
        allocations = getOptimalAllocationForRoutes(routes,nodeRoutes,totalInput)
        result = [getOutputFromRoute(r,nr,a) for r,nr,a in zip(routes,nodeRoutes,allocations)]
    else:
        droutes = [routes[i] for i in directRouteInds]
        dnodeRoutes = [nodeRoutes[i] for i in directRouteInds]
        dallocations = getOptimalAllocationForRoutes(droutes,dnodeRoutes,totalInput)
        dallocDict = dict(zip(directRouteInds, dallocations))
        allocations = []
        for i in range(initLengthRoutes):
            if i in directRouteInds:
                allocations.append(dallocDict[i])
            else:
                allocations.append(Decimal(0))
        
        result = [getOutputFromRoute(r,nr,a) for r,nr,a in zip(routes,nodeRoutes,allocations)]
        
    return result, allocations



def getBestOptimalAllocationsAndOutputs(pools=None,inputToken='wrap.near',outputToken='dbio.near',totalInput=0):
    if pools is None:
        pools = getAllNonzeroPools()
    paths = getPathsFromPools(pools,inputToken,outputToken)
    poolChains = getPoolChainFromPaths(paths, pools)
    routes = getRoutesFromPoolChain(poolChains)
    nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)

    allocations = getBestOptInput(routes, nodeRoutes, totalInput)
    outputs = getBestOptOutput(routes, nodeRoutes, totalInput)
    
    return allocations, outputs,routes, nodeRoutes


def getMiddleTokenTotals(routes,nodeRoutes,allocations):
  mtt = {}
  for route,nodeRoute,allocation in zip(routes,nodeRoutes,allocations):
    if len(route) > 1:
      middleToken = nodeRoute[1]
      if middleToken not in mtt:
        mtt[middleToken] = getOutputSingleHop(route[0],nodeRoute[0],middleToken,allocation)
      else:
        #print('middle token received multiple allocations')
        mtt[middleToken] += getOutputSingleHop(route[0],nodeRoute[0],middleToken,allocation)
  return mtt


def getSecondHopAllocations(routes,nodeRoutes,allocations):
  '''To be used in determining input amounts for second hop in transactions.
  '''
  mtt = getMiddleTokenTotals(routes,nodeRoutes,allocations)
  secondHopAllocations = {}
  mtRoutes = {mt:{i:allocations[i] for i in range(len(routes)) if nodeRoutes[i][1]==mt} for mt in mtt}
  #TODO: complete the following as checks on mid-token allocations
  #now get unique pools per mtRoute second hop. 
  #then combine the allocation from mtRoutes per pool
  #then get the total fraction per pool of initial route allocation. 
  #then multiply this fraction by the middle token total and use this as input for second transaction


  raise NotImplementedError 
  middleTokens = [nodeRoute[1] for nodeRoute in nodeRoutes if len(nodeRoute)==3]

  for i,route,nodeRoute,allocation in zip(range(len(routes)),routes,nodeRoutes,allocations):
    if len(route) == 1:
      secondHopAllocations[i] = Decimal(0)
      continue
    # make a dict of dict of middle token name to route id(s) to initial allocation per route id


def getTransactionListFromRoutesAndAllocations(routes, nodeRoutes, allocations,hopMultiplier = 0.99):
    transactions = []
    #consider all routes of length 2 with non-zero allocation. (double-hops)
    # among these, check for parallel swaps. That is, check for common node routes
    # for first hop. Then check for common node routes on second hop. 
    # when common node routes occur for the first hop:
    # 1. Calculate the total expected output of intermediate token. 
    # 2. 
    # when common node routes occur for the second hop:
    # 1. get a ratio of the input allocations of the full routes associated with
    # these common node routes. allocate the total intermediate token output 
    # toward these 2nd hop routes in the same ratio as their route input allocations.
    
    
    #middleTokenTotals = getMiddleTokenTotals(routes,nodeRoutes,allocations)
    #TODO: complete this function with middle token checks.
    
    for route, nodeRoute, allocation in zip(routes,nodeRoutes,allocations):
        if allocation == 0:
            # print('skipping case for 0 allocation...')
            continue
        if len(route) == 1:
            #single hop. Only one transaction.
            pool = route[0]
            poolId = pool['id']
            inputToken, outputToken = nodeRoute
            transaction = {'poolId':poolId,
                           'inputToken':inputToken,
                           'outputToken':outputToken,
                           'amountIn': allocation}
            transactions.append(transaction)
        elif len(route) == 2:
            #double hop. Two transactions.
            pool1,pool2 = route
            pool1Id = pool1['id']
            pool2Id = pool2['id']
            inputToken, middleToken, outputToken = nodeRoute
            transaction1 = {'poolId':pool1Id,
                           'inputToken':inputToken,
                           'outputToken':middleToken,
                           'amountIn': allocation}
            expectedAmountOut = getOutputSingleHop(pool1, inputToken, middleToken, allocation)
            #multiplier to account for slippage:
            expectedAmountOutReduced = expectedAmountOut * Decimal(hopMultiplier)
            transaction2 = {'poolId':pool2Id,
                           'inputToken':middleToken,
                           'outputToken':outputToken,
                           'amountIn': expectedAmountOutReduced}
            transactions.append(transaction1)
            transactions.append(transaction2)
    return transactions


def getTokensFromPools(pools):
  tokens = []
  for pool in pools:
    for token in pool['token_account_ids']:
      if token not in tokens:
        tokens.append(token)
  return tokens


def getSmartRouteSwapTransactionsORIG(pools=None, inputToken = 'wrap.near', outputToken = 'dbio.near', totalInput=0):
  '''contains original code for generating transaction objects. treats all 
  routes as independent and does not try to combine same-pool transactions into 
  a single transaction.
  '''
  if not totalInput:
      return []
  if pools is None:
      pools = getAllNonzeroPools()
  allocations, outputs,routes, nodeRoutes = getBestOptimalAllocationsAndOutputs(pools, inputToken,outputToken,totalInput)
  transactions = getTransactionListFromRoutesAndAllocations(routes, nodeRoutes, allocations,hopMultiplier = 0.99)
  return transactions



            
#NEED TO ADD IN STABLESWAP POOL!!


# MAIN FUNCTION:

def getSmartRouteSwapTransactions(pools=None, inputToken = 'wrap.near', outputToken = 'dbio.near', totalInput=0):
    """
    Main smart route swap function for generating the transactions necessary
    to transfer totalInput amount of inputToken in order to yield maximum amount
    of outputToken. 
    

    Parameters
    ----------
    pools : list<pool object>, optional
        list of simple CPMM pool objects collected from Ref Finance getPools() function. 
        The default is None, which causes the function to call getAllNonzeroPools().
    inputToken : str
        name of token contract for input token. The default is 'wrap.near'.
    outputToken : str
        name of token contract for output token. The default is 'dbio.near'.
    totalInput : int, float, or Decimal (will be converted to Decimal)
        total amount of inputToken to trade. Specified in units of  The default is 0.

    Returns
    -------
    list<dict>
        list of transaction dictionary objects.

    """
    if not totalInput:
        return []
    if pools is None:
        pools = getAllNonzeroPools()
    allocations, outputs,routes, nodeRoutes = getBestOptimalAllocationsAndOutputs(pools, inputToken,outputToken,totalInput)
    transactions = getTransactionListFromRoutesAndAllocations(routes, nodeRoutes, allocations,hopMultiplier = 0.99)
    #Note, if there are multiple transactions for a single pool, it might lead to sub-optimal
    #returns. This is due to the fact that the routes are treated as independent, where
    #here, if one transaction goes through in a pool, it changes the price of the asset 
    #before the second transaction can occur.
    
    #combine same-pool transactions into single transaction:
    if len(set(txn['poolId'] for txn in transactions)) < len(transactions):
        pid = {}
        for t in transactions:
            currentPoolId = t['poolId']
            if currentPoolId in pid:
                pid[currentPoolId].append(t)
            else:
                pid[currentPoolId] = [t]
        newTransactions = []
        for poolId,transactionList in pid.items():
            poolTotalInput = sum(t['amountIn'] for t in transactionList)
            inputToken = transactionList[0]['inputToken']
            outputToken = transactionList[0]['outputToken']
            #pool = [p for p in pools if p['id']==poolId]
            #expectedOut = getOutputSingleHop(pool, inputToken, outputToken, poolTotalInput)
            #can add expectedOut*(1-slippage) later as expected return from transaction
            newTxn = {'poolId':poolId,
                      'inputToken':inputToken,
                      'outputToken':outputToken,
                      'amountIn':poolTotalInput}
            newTransactions.append(newTxn)
        transactions = newTransactions
    return transactions

"""## Testing Code"""


def testAddingRoutes(pools=None,inputToken='wrap.near',outputToken='dbio.near'):
    if pools is None:
        pools = getAllNonzeroPools()
    paths = getPathsFromPools(pools,inputToken,outputToken)
    poolChains = getPoolChainFromPaths(paths, pools)
    routes = getRoutesFromPoolChain(poolChains)
    nodeRoutes = getNodeRoutesFromPathsAndPoolChains(paths, poolChains)
    
    tis = np.logspace(10,50,300)
    res = {}
    plt.figure(figsize=(10,7));
    plt.xlabel(f'Amount Input Token {inputToken}')
    plt.xlabel(f'Amount Output Token {outputToken}')
    for i in range(1,len(routes)):
        res[i] = [getBestOptOutput(routes[:i],nodeRoutes[:i],ti) for ti in tis]
        plt.loglog(tis, res[i],'o',label=f'{i} rt.')
        plt.legend(loc='best')
    plt.show()

# conn = MultiNodeJsonProvider("MAINNET")

# pools = getAllNonzeroPools()

# testAddingRoutes(pools)

# getSmartRouteSwapTransactions(pools=pools, inputToken = 'meta-pool.near', outputToken = 'meritocracy.tkn.near', totalInput=1E28)

# allocations,output,routes,nodeRoutes = getBestOptimalAllocationsAndOutputs(pools,totalInput=1E26)

# mtt = getMiddleTokenTotals(routes,nodeRoutes,allocations)
# mtRoutes = {mt:{i:allocations[i] for i in range(len(routes)) if nodeRoutes[i][1]==mt} for mt in mtt}
# mtRoutes

# pool = [p for p in pools if p['id']==1905][0]
# out = getOutputSingleHop(pool,'meta-pool.near','socialmeet.tkn.near',Decimal('9923667005772497220334281202'))

# allTokens = getTokensFromPools(pools)
# len(allTokens)
# transactions = {}
# for i,token1 in enumerate(allTokens):
#   #print(i/len(allTokens)*100)
#   transactions[token1] = {}
#   for token2 in allTokens:
#     if token2 != token1:
#       try:
#         txns = getSmartRouteSwapTransactions(pools=pools, inputToken = token1, outputToken = token2, totalInput=1E28)
#       except:
#         txns = []
#       transactions[token1][token2] = txns

# allTokens = getTokensFromPools(pools)
# for inputToken in allTokens[0:]:
#   for outputToken in allTokens[:]:
#     if outputToken != inputToken:
#       try:
#         a,b,c,d = getBestOptimalAllocationsAndOutputs(pools=pools,inputToken=inputToken,outputToken=outputToken,totalInput=1E20)
#         poolIds = [t['poolId'] for t in c]
#         if len(poolIds) > len(set(poolIds)):
#           print(c)
#       except:
#         pass
#         #print(f'no route found for {inputToken} to {outputToken}')
#         # assert(False)

# def findTokenPairsWithParallelPools(pools):
#   allTokens = getTokensFromPools(pools)
#   mm = []
#   pairs = []
#   for inputToken in allTokens:
#     for outputToken in allTokens:
#       if inputToken!=outputToken:
#         fpools = getPoolsWithToken1ANDToken2(pools,inputToken,outputToken)
#         if len(fpools)>1:
#           mm.append(len(fpools))
#           pair = sorted([inputToken,outputToken])
#           if pair not in pairs:
#             pairs.append(pair)
#             mm.append(len(fpools))
          
#   return mm,pairs




# mm,pairs = findTokenPairsWithParallelPools(pools)

# pairs

# numTxns = []
# bigones = []
# for t1,v1 in transactions.items():
#   for t2,v2 in v1.items():
#     numTxns.append(len(v2))
#     if len(v2)>10:
#       bigones.append(v2)

# sorted([elem['poolId'] for elem in bigones[0]])

# inputToken = 'token.v2.ref-finance.near'
# outputToken = 'wrap.near'
# totalInput = 1E20

# pools = getPoolsWithToken1ORToken2(pools=getAllNonzeroPools(),token1=inputToken,token2=outputToken)
# reducedPools = getPoolsWithToken1ANDToken2(pools=pools,token1=inputToken,token2=outputToken)

# fullAllocations, fullOutputs,fullRoutes, fullNodeRoutes = getBestOptimalAllocationsAndOutputs(pools=pools,inputToken = inputToken, outputToken = outputToken, totalInput=1E20)
# partialAllocations, partialOutputs,partialRoutes, partialNodeRoutes = getBestOptimalAllocationsAndOutputs(reducedPools, inputToken = inputToken, outputToken = outputToken, totalInput=1E20)

# print(fullOutputs  / partialOutputs)

# totalInput = 1E30

# fullAllocations, fullOutputs,fullRoutes, fullNodeRoutes = getBestOptimalAllocationsAndOutputs(pools=pools,inputToken = outputToken, outputToken = inputToken, totalInput=totalInput)
# partialAllocations, partialOutputs,partialRoutes, partialNodeRoutes = getBestOptimalAllocationsAndOutputs(reducedPools, inputToken = outputToken, outputToken = inputToken, totalInput=totalInput)

# print(partialAllocations)
# print(fullAllocations)

# print(fullOutputs / partialOutputs)

# 4.32/4.28

# len(getSmartRouteSwapTransactions(pools=pools, inputToken = inputToken, outputToken = outputToken, totalInput=1E28))

#ps = getPoolsWithToken1ANDToken2(pools=getAllNonzeroPools(),token1='wrap.near',token2='dbio.near')
#ps
##inputToken = 'wrap.near'
#outputToken = 'dbio.near'
# ps = getPoolsWithToken1ORToken2(pools=getAllNonzeroPools(),token1=inputToken,token2=outputToken)
# paths = getPathsFromPools(ps,'wrap.near','dbio.near')

# pc = getPoolChainFromPaths(paths,ps)
##[np.prod([Decimal(x) for x in pc[0][0][j]['amounts']]) for j in range(len(pc[0][0]))]

#print([[len(pc[i][j]) for j in range(len(pc[i]))] for i in range(len(pc))])
# for 
#liq = getLiquidityOfPoolsFromList(pc[0][0])
##[v/np.max(liq) for v in liq]
#cullPoolsWithInsufficientLiquidity(pc[0][0])
#cpc = getCulledPoolChain(pc)
##print([[len(cpc[i][j]) for j in range(len(cpc[i]))] for i in range(len(cpc))])

#[[getNormalizedLiquiditiesFromList(pc[i][j]) for j in range(len(pc[i]))] for i in range(len(pc))]

# a,b,c,d = getBestOptimalAllocationsAndOutputs(pools=ps,inputToken = 'wrap.near', outputToken = 'dbio.near', totalInput=1E28)
# print(a)
# np.sum(allocations[5:]) / np.sum(allocations[:5])

# mg = nx.multigraph.MultiGraph()
# for r in routes:
#   for p in r:
#     hop = p['token_account_ids']
#     mg.add_edges_from([hop])
# nx.draw_circular(mg,with_labels=True)

# a,b,c,d = getBestOptimalAllocationsAndOutputs(pools=pools,inputToken = 'wrap.near', outputToken = 'dbio.near', totalInput=1E28)
# txns = getSmartRouteSwapTransactions(pools,totalInput=1E28)