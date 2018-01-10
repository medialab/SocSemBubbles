import json, sys
import networkx as nx
import community

def get_communities_from_partitions(community_partition):
    communities_dict = {}
    for node, partition_number in community_partition.items():
        if partition_number not in communities_dict:
            communities_dict[partition_number] = set()
        communities_dict[partition_number].add(node)
    return communities_dict

def community_sameness(first_set, second_set):
    return len(first_set & second_set)/len(first_set | second_set)

def get_core_communities_from_two(first_communities, second_communities):
    map_first_to_second = {}
    # Align communities by sameness metric
    for key_first, set_first in first_communities.items():
        max_alignment_value = 0
        max_alignment_key = -1
        map_first_to_second[key_first] = set()
        for key_second, set_second in second_communities.items():
            if set_second.issubset(set_first):
                map_first_to_second[key_first].add(key_second)
            alignment = community_sameness(set_first, set_second)
            if alignment > max_alignment_value:
                max_alignment_value = alignment
                max_alignment_key = key_second
        map_first_to_second[key_first].add(max_alignment_key)
    core_communities = {}
    for key_first, key_second_set in map_first_to_second.items():
        core_communities[key_first] = set()
        for key_second in key_second_set:
            core_communities[key_first] |= first_communities[key_first] & second_communities[key_second]
    return core_communities

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("USAGE : " + sys.argv[0] + '[srcBinocularsJSON]')
    with open(sys.argv[1], 'r') as f:
        binocular_datastructure = json.load(f)

        concepts_graph = nx.Graph()
        for concept, (frequency, _) in binocular_datastructure['concepts'].items():
            concepts_graph.add_node(concept, freq=frequency)
            for target_concept, w in binocular_datastructure['cc'][concept].items():
                concepts_graph.add_edge(concept, target_concept, weight=w)

        actors_graph = nx.Graph()
        for actor, (frequency, _) in binocular_datastructure['actors'].items():
            actors_graph.add_node(actor, freq=frequency)
            for target_actor, w in binocular_datastructure['aa'][actor].items():
                actors_graph.add_edge(actor, target_actor, weight=w)

        original_partition = community.best_partition(concepts_graph, randomize=True)
        #current_partition = community.best_partition(concepts_graph, randomize=True)
        original_communities = get_communities_from_partitions(original_partition)
        #communities2 = get_communities_from_partitions(partition2)
        #ex1 = {0: {'innovation', 'multilevel networks', 'ERGMs', 'organizations'}, 1: {'scientific communities', 'complex networks', 'online communities', 'public sphere'}, 2: {'semantic networks', 'duality', 'text mining', 'networks dynamics', 'visualization', 'historical sociology', 'communication', 'social networks', 'topic models', 'networks', 'NLP'}, 3: {'multi-mode networks', 'communication networks', 'socio-semantic networks', 'culture', 'community', 'cities'}}
        #ex2 = {0: {'innovation', 'multilevel networks', 'ERGMs', 'organizations'}, 1: {'scientific communities', 'complex networks', 'online communities', 'NLP', 'public sphere'}, 2: {'semantic networks', 'duality', 'communication', 'historical sociology', 'social networks', 'topic models', 'culture'}, 3: {'networks dynamics', 'visualization', 'networks', 'text mining'}, 4: {'multi-mode networks', 'socio-semantic networks', 'cities', 'community', 'communication networks'}}
#        print(communities1, communities2)
        #print(get_core_communities_from_two(ex1, ex2))
        for i in range(200):
            current_communities = get_communities_from_partitions(community.best_partition(concepts_graph, randomize=True))
            original_communities = get_core_communities_from_two(original_communities, current_communities)
        print(original_communities, len([concept for key, item in original_communities.items() for concept in item]), '/', len(binocular_datastructure['concepts']))
