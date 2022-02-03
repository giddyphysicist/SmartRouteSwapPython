import json
import networkx as nx
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime, timezone

from urllib.request import urlopen
url = 'https://indexer.ref-finance.net/list-pools'
response = urlopen(url)
data_json = json.loads(response.read())

token_dict = {p['token_account_ids'][i]: p['token_symbols'][i] for p in data_json for i in [0,1]}


def getAllNonzeroPools(pools=None):
    if pools is None:
        pools = data_json
    nzPools = [p for p in pools if '0' not in p['amounts']]
    return nzPools


def getTransitions(pools=None):
    if pools is None:
        pools = getAllNonzeroPools()
    pairPools = [p for p in pools if len(p['token_account_ids'])==2]
    otherPools = [p for p in pools if p not in pairPools]
    transitions = [p['token_account_ids'] for p in pairPools]
    for p in otherPools:
        # enumerate pairings for larger pools, such as tri-pools
        pass
    return transitions


def getGraph(transitions):
    g = nx.Graph()
    g.add_edges_from(transitions)
    return g


def getAllTokens(pools=None):
    if pools is None:
        pools = getAllNonzeroPools()
    tokens = []
    for p in pools:
        for t in p['token_account_ids']:
            if t not in tokens:
                tokens.append(t)
    return tokens    


def getShortestPathLengthMatrix(pools=None,g=None):
    if  pools is None:       
        pools = getAllNonzeroPools()
        pools = [p for p in pools if len(p['token_account_ids'])==2]
    if g is None:
        g = getGraph(getTransitions(pools))
    tokens = getAllTokens(pools)
    matrix = np.zeros((len(tokens),len(tokens)))
    
    for i,token1 in enumerate(tokens):
        for j,token2 in enumerate(tokens):
            if j!=i:
                if nx.algorithms.has_path(g,token1,token2):
                    matrix[i,j] = nx.shortest_paths.shortest_path_length(g, token1, token2)
                else:
                    matrix[i,j] = np.inf
    return matrix

timestamp = datetime.now(timezone.utc).strftime("%d %B, %Y at %H:%M:%S UTC")
mdf = open('tvl_report.md', 'w')
print('# TVL coverage of Ref Smart Routing', end='\n\n', file=mdf)


print(f'Report generated {timestamp}', end='\n\n', file=mdf)

x = getAllNonzeroPools()
number_of_pools = len(data_json)
number_of_nonzero_pools = len(x)

print('## Basic Stats', end='\n\n', file=mdf)
print(f'Total number of pools = {number_of_pools}', end='\n\n', file=mdf)
print(f'Total number of "nonzero" pools = {number_of_nonzero_pools}', end='\n\n', file=mdf)


ts = getTransitions()
mg = getGraph(ts)
# nx.draw_circular(mg)

degree_c = nx.degree_centrality(mg)
#{k: v for k, v in sorted(c.items(), key=lambda item: item[1]) if v > 0.2}
c = sorted(degree_c, key=degree_c.get, reverse=True)
with open('degree_centrality.json', 'w') as f:
    json.dump(degree_c, f)
degree_sorted = {token_dict[k]: degree_c[k] for k in c[:3]}

print('## Connectivity and Path-length', end='\n\n', file=mdf)

print('### Most connected Tokens', end='\n\n', file=mdf)
print('''Intuitively, we can see that many tokens are connected in a pool to wNear.
We'd like to quantify how connected it is,
as well as to determine if there are any other well-connected tokens.
The measurement is called degree centrality, widely utilized in graph analysis.
''', end='\n\n', file=mdf)
print(*[f'* {k}\t{v}' for k,v in degree_sorted.items()], sep='\n', end='\n\n', file=mdf)


print('### Shortest Paths between tokens', end='\n\n', file=mdf)
mm = getShortestPathLengthMatrix()

plt.figure(figsize=(6, 4))
plt.imshow(mm, origin='lower')
plt.colorbar()
plt.savefig('shortest_path_1.png')
plt.close()

print('![Shortest Path Matrix](shortest_path_1.png)', end='\n\n', file=mdf)

print('''On this path matrix, we can see how many hops are required to get from any token to any token.
The values of the diagonal are all zero, meaning it is the same token.
The white bands are infinite, where there is no connection whatsoever.
The points that show they are equal to 1 are direct swap opportunities.
The points that show they are equal to 2 will be enabled by smart routing, with a single intermediate hop.
The few cases that equal 3 or 4 could be reached if more hops were enabled.
''', end='\n\n', file=mdf)

print('### How many pools and tokens are covered', end='\n\n', file=mdf)
ps = data_json

full_set = set([token for p in ps for token in p['token_account_ids']])
# len(full_set)
print(f'The total number of tokens in Ref = {len(full_set)}', end='\n\n', file=mdf)

near_pools = [p for p in ps if (c[0] in p['token_account_ids'])]
number_of_near_pools = len(near_pools)
print(f'Number of pools with wNear = {number_of_near_pools}', end='\n\n', file=mdf)

near_set = set([token for p in near_pools for token in p['token_account_ids']])
print(f'The total number of tokens in pools with wNear = {len(near_set)}', end='\n\n', file=mdf)

never_set = set()
for comp in nx.connected_components(getGraph(getTransitions(data_json))):
    if c[0] not in comp:
        never_set.update(comp)


same = []
near = []
different = []
two_hop = []
never = []
for p in ps:
  if len(never_set.intersection(p['token_account_ids'])) > 0:
    never.append(p)
  elif 'wrap.near' in p['token_account_ids']:
    near.append(p)
  elif len(near_set.intersection(p['token_account_ids'])) == len(p['token_account_ids']):
    same.append(p)
  elif len(near_set.intersection(p['token_account_ids'])) > 0:
    two_hop.append(p)
  else:
    different.append(p)

print('## Results', end='\n\n', file=mdf)

print('### Number of pools covered', end='\n\n', file=mdf)

print(f'Total number of pools that can NEVER be connected to the main graph = {len(never)}', end='\n\n', file=mdf)
print(f'Total number of pools that are indirectly connected but 1 hop away from wNear = {len(two_hop)}', end='\n\n', file=mdf)
print(f'Total number of pools that are indirectly connected but 2 or more hops away from wNear = {len(different)}', end='\n\n', file=mdf)

print('### TVL in covered pools', end='\n\n', file=mdf)

total_tvl = sum([float(p['tvl']) for p in data_json])
different_tvl = sum([float(p['tvl']) for p in different])
two_hop_tvl = sum([float(p['tvl']) for p in two_hop])
never_tvl = sum([float(p['tvl']) for p in never])
direct_tvl = total_tvl - two_hop_tvl - different_tvl - never_tvl
print(f'Total TVL in Ref = {total_tvl}', end='\n\n', file=mdf)
print(f'Total TVL directly connected to wNear = {direct_tvl}', end='\n\n', file=mdf)
print(f'Total TVL 1 hop away from wNear = {two_hop_tvl}', end='\n\n', file=mdf)
print(f'Total TVL 2 or more hops away from wNear = {different_tvl}', end='\n\n', file=mdf)
print(f'Total TVL NEVER connected to wNear = {never_tvl}', end='\n\n', file=mdf)

print('### TVL percentage', end='\n\n', file=mdf)

covered_tvl_percentage = 100 * direct_tvl / total_tvl
potential_tvl_percentage = 100 * (two_hop_tvl + different_tvl) / total_tvl
never_tvl_percentage = 100 * never_tvl / total_tvl
print(f'**Percentage of TVL covered by 1 hop using wNear: {covered_tvl_percentage:.2f}% **', end='\n\n', file=mdf)
print(f'Percentage of TVL that *could* be covered by 2+ hops using wNear: {potential_tvl_percentage:.2f}%', end='\n\n', file=mdf)
print(f'Percentage of TVL completely disconnected from wNear: {never_tvl_percentage:.2f}%', end='\n\n', file=mdf)

print('### Covered Tokens', end='\n\n', file=mdf)

two_hop_set = set([token for p in two_hop for token in p['token_account_ids']]) - near_set
different_set = set([token for p in two_hop for token in p['token_account_ids']]) - near_set - two_hop_set
print(f'The total number of tokens in pools with wNear = {len(near_set)}', end='\n\n', file=mdf)
print(f'The total number of tokens 1 hop away from wNear = {len(two_hop_set)}', end='\n\n', file=mdf)
print(f'The total number of tokens 2 or more hops away from wNear = {len(different_set)}', end='\n\n', file=mdf)
print(f'Number of tokens that can NEVER be connected to wNear = {len(never_set)}', end='\n\n', file=mdf)



print('#### Tokens in Ref that are indirectly connected but 1 hop away from wNear:', end='\n\n', file=mdf)
print(*[f'* {token_dict[t]}' for t in two_hop_set], sep='\n', end='\n\n', file=mdf)

print('''*Note:* 
These tokens may still be pretty well connected and will be able to swap with some other tokens,
but will not reach the entire rest of the network in 1 intermediate hop.''', end='\n\n', file=mdf)

print('#### Tokens in Ref that are indirectly connected but 2 or more hops away from wNear:', end='\n\n', file=mdf)
print(*[f'* {token_dict[t]}' for t in different_set], sep='\n', end='\n\n', file=mdf)

print('#### Tokens in Ref that are totally disconnected from wNear:', end='\n\n', file=mdf)
print(*[f'* {token_dict[t]}' for t in never_set], sep='\n', end='\n\n', file=mdf)


mdf.close()