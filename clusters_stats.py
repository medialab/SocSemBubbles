import json, sys
import networkx as nx
import community

def get_communities_from_partitions(partition_dict):
    """Format convertion: from cluster number keyed by node to node set keyed by cluster number."""
    communities_dict = {}
    for node, partition_number in partition_dict.items():
        if partition_number not in communities_dict:
            communities_dict[partition_number] = set()
        communities_dict[partition_number].add(node)
    return communities_dict

def get_partitions_from_communities(communities_dict):
    """Format convertion: from node set keyed by cluster number to cluster number keyed by node."""
    partitions_dict = {}
    for community_id, node_set in communities_dict.items():
        for node in node_set:
            partitions_dict[node] = community_id
    return partitions_dict

def jaccard_index(first_set, second_set):
    return len(first_set & second_set)/len(first_set | second_set)

def get_core_communities_from_two(first_communities, second_communities):
    """Get core communities from two community sets (on the same graph).
    Smallest comunities are kept: clusters including others split.
    """
    core_communities = {}
    map_first_to_second = {}
    core_key = 0

    # Strategy:
    # Align communities by sameness metric (currently Jaccard Index) if there is no inclusion so far.
    # If we detect community inclusion, we keep the smallest communities,
    # consequently larger clusters are splitted.
    for key_first, set_first in first_communities.items():
        max_alignment_value = 0
        max_alignment_key = -1
        working_set = set_first.copy()
        for key_second, set_second in second_communities.items():
            if set_second.issubset(working_set):
                # First cluster is larger than second: eviction of the subset
                working_set -= set_second
                # ... and keep smallest cluster at the end
                core_communities[core_key] = set_second
                core_key += 1

            else:
                alignment = jaccard_index(working_set, set_second)
                if alignment > max_alignment_value:
                    max_alignment_value = alignment
                    max_alignment_key = key_second

        if max_alignment_value > 0 :
            map_first_to_second[key_first] = max_alignment_key

    for key_first, key_second in map_first_to_second.items():
         core_communities[core_key] = first_communities[key_first] & second_communities[key_second]
         core_key += 1

    return core_communities

def get_basic_communities_diversity(source_communities, target_communities, one_to_two_nodes_edges_dict):
    """Basic metric: count how many target communities are linked to a source community,
    for each source community.
    """
    communities_links = {}
    target_partition = get_partitions_from_communities(target_communities)
    for community, node_set in source_communities.items():
        communities_links[community] = set()
        for node in node_set:
            for target_node in one_to_two_nodes_edges_dict[node]:
                if target_node in target_partition:
                    communities_links[community].add(target_partition[target_node])
    return communities_links

def get_per_node_weighted_references(source_communities, target_communities, one_to_two_nodes_edges_dict):
    """Returns dict keyed by node conveying target community's clusters connection."""
    nodes_links = {}
    target_partition = get_partitions_from_communities(target_communities)
    for community, node_set in source_communities.items():
        for node in node_set:
            node_targets = one_to_two_nodes_edges_dict[node]
            nodes_links[node] = {'total':0, 'dispatch':{}}
            for target_node in node_targets:
                if target_node in target_partition:# It's in a core !
                    nodes_links[node]['total'] += 1
                    target_community = target_partition[target_node]
                    if target_community not in nodes_links[node]['dispatch']:
                        nodes_links[node]['dispatch'][target_community] = 0
                    nodes_links[node]['dispatch'][target_community] += 1
    return nodes_links

if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit("USAGE : " + sys.argv[0] + '[srcBinocularsJSON] [semantic GEXF] [socio GEXF]')
    with open(sys.argv[1], 'r') as f:
        binocular_datastructure = json.load(f)

        # Draw the actors and concept graphs (used for Louvain community detection)
        concepts_graph = nx.Graph()
        for concept, item in binocular_datastructure['concepts'].items():
            concepts_graph.add_node(concept, freq=item['frequency'])
            for target_concept, w in binocular_datastructure['cc'][concept].items():
                concepts_graph.add_edge(min(concept, target_concept), max(concept, target_concept), weight=w)

        actors_graph = nx.Graph()
        for actor, item in binocular_datastructure['actors'].items():
            actors_graph.add_node(actor, freq=item['frequency'])
            for target_actor, w in binocular_datastructure['aa'][actor].items():
                actors_graph.add_edge(min(actor, target_actor), max(actor, target_actor), weight=w)

        samples_number = 5

        # Samples list preallocation

        original_concept_partition = [None]*samples_number
        original_concept_communities = [None]*samples_number
        original_actor_partition = [None]*samples_number
        original_actor_communities = [None]*samples_number

        for i in range(samples_number):
            # Initial seeds for community stabilisation
            original_concept_partition[i] = community.best_partition(concepts_graph, randomize=True)
            original_concept_communities[i] = get_communities_from_partitions(original_concept_partition[i])

            original_actor_partition[i] = community.best_partition(actors_graph, randomize=True)
            original_actor_communities[i] = get_communities_from_partitions(original_actor_partition[i])

            #ex1 = {0: {'innovation', 'multilevel networks', 'ERGMs', 'organizations'}, 1: {'scientific communities', 'complex networks', 'online communities', 'public sphere'}, 2: {'semantic networks', 'duality', 'text mining', 'networks dynamics', 'visualization', 'historical sociology', 'communication', 'social networks', 'topic models', 'networks', 'NLP'}, 3: {'multi-mode networks', 'communication networks', 'socio-semantic networks', 'culture', 'community', 'cities'}}
            #ex2 = {0: {'innovation', 'multilevel networks', 'ERGMs', 'organizations'}, 1: {'scientific communities', 'complex networks', 'online communities', 'NLP', 'public sphere'}, 2: {'semantic networks', 'duality', 'communication', 'historical sociology', 'social networks', 'topic models', 'culture'}, 3: {'networks dynamics', 'visualization', 'networks', 'text mining'}, 4: {'multi-mode networks', 'socio-semantic networks', 'cities', 'community', 'communication networks'}}
            #print(get_core_communities_from_two(ex1, ex2))

            # Communities stabilisation
            for j in range(200):
                current_concept_communities = get_communities_from_partitions(community.best_partition(concepts_graph, randomize=True))
                original_concept_communities[i] = get_core_communities_from_two(original_concept_communities[i], current_concept_communities)

                current_actor_communities = get_communities_from_partitions(community.best_partition(actors_graph, randomize=True))
                original_actor_communities[i] = get_core_communities_from_two(original_actor_communities[i], current_actor_communities)
            #print(original_concept_communities[i])

        # Samples fusion

        #print('orig', original_concept_communities[0])
        #test_ = get_core_communities_from_two(original_concept_communities[0], original_concept_communities[1])
        #print('orig2', original_concept_communities[0])
        #print('test', test_)

        for i in range(samples_number-1, 0, -1):
            for j in range(i):
                #print(j, original_concept_communities[j])
                original_concept_communities[j] = get_core_communities_from_two(original_concept_communities[j], original_concept_communities[j+1])
                original_actor_communities[j] = get_core_communities_from_two(original_actor_communities[j], original_actor_communities[j+1])

        original_concept_communities = original_concept_communities[0]
        original_actor_communities = original_actor_communities[0]

        print(original_concept_communities, len([concept for key, item in original_concept_communities.items() for concept in item]), '/', len(binocular_datastructure['concepts']))
        print(original_actor_communities, len([actor for key, item in original_actor_communities.items() for actor in item]), '/', len(binocular_datastructure['actors']))

        # Links between stabilised communities
        semantic_to_socio_communities_links = get_basic_communities_diversity(original_concept_communities, original_actor_communities, binocular_datastructure['ca'])
        socio_to_semantic_communities_links = get_basic_communities_diversity(original_actor_communities, original_concept_communities, binocular_datastructure['ac'])
        print(semantic_to_socio_communities_links)
        print(socio_to_semantic_communities_links)

        semantic_socio_counts = {}
        socio_semantic_counts = {}
        for _, communities_set in semantic_to_socio_communities_links.items():
            c_count = len(communities_set)
            if c_count not in semantic_socio_counts:
                semantic_socio_counts[c_count] = 1
            else:
                semantic_socio_counts[c_count] += 1

        for _, communities_set in socio_to_semantic_communities_links.items():
            c_count = len(communities_set)
            if c_count not in socio_semantic_counts:
                socio_semantic_counts[c_count] = 1
            else:
                socio_semantic_counts[c_count] += 1
        print(semantic_socio_counts)
        print(socio_semantic_counts)

        print(get_per_node_weighted_references(original_actor_communities, original_concept_communities, binocular_datastructure['ac']))

        nx.set_node_attributes(concepts_graph, name='python_class', values=get_partitions_from_communities(original_concept_communities))
        #nx.set_node_attributes(concepts_graph, name='python_class', values=original_concept_partition)
        nx.set_node_attributes(actors_graph, name='python_class', values=get_partitions_from_communities(original_actor_communities))
        #nx.set_node_attributes(actors_graph, name='python_class', values=original_actor_partition)
        nx.write_gexf(concepts_graph, sys.argv[2])
        nx.write_gexf(actors_graph, sys.argv[3])
