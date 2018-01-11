import json, sys
import networkx as nx
import community

def get_communities_from_partitions(partition_dict):
    communities_dict = {}
    for node, partition_number in partition_dict.items():
        if partition_number not in communities_dict:
            communities_dict[partition_number] = set()
        communities_dict[partition_number].add(node)
    return communities_dict

def get_partitions_from_communities(communities_dict):
    partitions_dict = {}
    for community_id, node_set in communities_dict.items():
        for node in node_set:
            partitions_dict[node] = community_id
    return partitions_dict

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

def get_communities_diversity(communities1, communities2, one_to_two_nodes_edges_dict):
    communities_links = {}
    partition2 = get_partitions_from_communities(communities2)
    for community, node_set in communities1.items():
        communities_links[community] = set()
        for node in node_set:
            for target_node in one_to_two_nodes_edges_dict[node]:
                if target_node in partition2:
                    communities_links[community].add(partition2[target_node])
    return communities_links

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

        original_concept_partition = community.best_partition(concepts_graph, randomize=True)
        original_concept_communities = get_communities_from_partitions(original_concept_partition)

        original_actor_partition = community.best_partition(actors_graph, randomize=True)
        original_actor_communities = get_communities_from_partitions(original_actor_partition)

        #ex1 = {0: {'innovation', 'multilevel networks', 'ERGMs', 'organizations'}, 1: {'scientific communities', 'complex networks', 'online communities', 'public sphere'}, 2: {'semantic networks', 'duality', 'text mining', 'networks dynamics', 'visualization', 'historical sociology', 'communication', 'social networks', 'topic models', 'networks', 'NLP'}, 3: {'multi-mode networks', 'communication networks', 'socio-semantic networks', 'culture', 'community', 'cities'}}
        #ex2 = {0: {'innovation', 'multilevel networks', 'ERGMs', 'organizations'}, 1: {'scientific communities', 'complex networks', 'online communities', 'NLP', 'public sphere'}, 2: {'semantic networks', 'duality', 'communication', 'historical sociology', 'social networks', 'topic models', 'culture'}, 3: {'networks dynamics', 'visualization', 'networks', 'text mining'}, 4: {'multi-mode networks', 'socio-semantic networks', 'cities', 'community', 'communication networks'}}
        #print(get_core_communities_from_two(ex1, ex2))
        for i in range(200):
            current_concept_communities = get_communities_from_partitions(community.best_partition(concepts_graph, randomize=True))
            original_concept_communities = get_core_communities_from_two(original_concept_communities, current_concept_communities)

            current_actor_communities = get_communities_from_partitions(community.best_partition(actors_graph, randomize=True))
            original_actor_communities = get_core_communities_from_two(original_actor_communities, current_actor_communities)
        print(original_concept_communities, len([concept for key, item in original_concept_communities.items() for concept in item]), '/', len(binocular_datastructure['concepts']))
        print(original_actor_communities, len([actor for key, item in original_actor_communities.items() for actor in item]), '/', len(binocular_datastructure['actors']))

        communities_links = get_communities_diversity(original_concept_communities, original_actor_communities, binocular_datastructure['ca'])
        print(communities_links)
        
