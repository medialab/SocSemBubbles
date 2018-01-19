import json, sys
import networkx as nx
import community
from operator import itemgetter
from math import ceil
from math import floor
from math import exp
import random

### Format conversion ###

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

### Core Communities ###

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

def fuse_core_communities(bootstraps_list):
    something_clustered = True
    cluster_stack = []
    while something_clustered:
        something_clustered = False

        smaller_community_anchor = False
        bootstrap_index = 0
        while bootstrap_index < len(bootstraps_list) and bootstraps_list[bootstrap_index] == {}:
            bootstrap_index += 1
        if bootstrap_index == len(bootstraps_list):
            continue
        within_boostrap_community_index = list(bootstraps_list[bootstrap_index].keys())[0]
        #bootstrap_aligned_community_indexes_sets = []
        current_community_anchor_set = None
        current_bootstrap_alignment = None

        while not smaller_community_anchor:
            smaller_community_anchor = True
            current_bootstrap_alignment = []
            current_community_anchor_set = bootstraps_list[bootstrap_index][within_boostrap_community_index]
            for b_index, bootstrap in enumerate(bootstraps_list):
                if b_index == bootstrap_index:
                    current_bootstrap_alignment.append(within_boostrap_community_index)

                elif smaller_community_anchor: # Don't get through all the bootstraps if a smaller community is found
                    max_alignment_value = 0
                    max_alignment_key = -1
                    for community_key, community_set in bootstrap.items():
                        #print(community_set)
                        #print(current_community_anchor_set)
                        if community_set.issubset(current_community_anchor_set) and community_set != current_community_anchor_set: # Redo it with the smaller one
                            within_boostrap_community_index = community_key
                            bootstrap_index = b_index
                            smaller_community_anchor = False

                        else:
                            current_alignment = jaccard_index(current_community_anchor_set, community_set)
                            if current_alignment > max_alignment_value:
                                max_alignment_value = current_alignment
                                max_alignment_key = community_key

                    current_bootstrap_alignment.append(max_alignment_key) # keep in mind that it can be -1

        # We have a plausible community alignment, now start to make the 95% merge
        ## Intersection
        tmp_intersection_set = current_community_anchor_set.copy()
        for b_index, c_index in enumerate(current_bootstrap_alignment):
            if c_index != -1:
                tmp_intersection_set &= bootstraps_list[b_index][c_index]
                something_clustered = True

        ## Mismatch counting
        mismatch_dict = {}
        for b_index, c_index in enumerate(current_bootstrap_alignment):
            if c_index != -1:
                current_community = bootstraps_list[b_index][c_index]
                for mismatched_node in current_community - tmp_intersection_set:
                    if mismatched_node not in mismatch_dict:
                        mismatch_dict[mismatched_node] = 1
                    else:
                        mismatch_dict[mismatched_node] += 1

        ## Remerging highly mismatched (ie highly present in bootstraps, but not all) nodes
        mismatch_list = [{'node': node_key, 'count': node_count} for node_key, node_count in mismatch_dict.items()]
        remerged_threshold = floor(len(bootstraps_list)*95/100)
        remerged_nodes = set()
        for mismatch in sorted(mismatch_list, key=itemgetter('count'), reverse=True):
            if mismatch['count'] > remerged_threshold:
                remerged_nodes.add(mismatch['node'])
        final_community = tmp_intersection_set | remerged_nodes

        ## Evict used communities and reiterate
        for b_index, c_index in enumerate(current_bootstrap_alignment):
            if c_index != -1:
                del bootstraps_list[b_index][c_index]

        if something_clustered:
            cluster_stack.append(final_community)
    fused_core_communities = {key: community for key, community in enumerate(cluster_stack)}
    return fused_core_communities

### (not exactly an) Implementation attempt of Rosvall M, Bergstrom CT (2010) Mapping Change in Large Networks. PLoS ONE 5(1): e8694. doi:10.1371/journal.pone.0008694 ###

def get_best_bootstrap_community_and_candidate_alignment(bootstrap_communities, candidate_subset):
    max_alignment = 0
    best_community_key = None
    for community_key, community_set in bootstrap_communities.items():
        current_alignment = len(community_set & candidate_subset)
        if current_alignment > max_alignment:
            max_alignment = current_alignment
            best_community_key = community_key
    return best_community_key

def get_configuration_penalty(bootstraps_communities, candidate_subset):
    penalty = 0
    mismatch_nodes = {}
    # Get all the nodes mismatch
    for bootstrap_key, bootstrap_communities in bootstraps_communities.items():
        current_bootstrap_key = get_best_bootstrap_community_and_candidate_alignment(bootstrap_communities, candidate_subset)
        for current_mismatched_node in bootstrap_communities[current_bootstrap_key] - candidate_subset:
            if current_mismatched_node not in mismatch_nodes:
                mismatch_nodes[current_mismatched_node] = {'count': 0, 'key': current_mismatched_node}
            mismatch_nodes[current_mismatched_node]['count'] += 1
    # Suppress higher 5%
    sorted_list = sorted(list(mismatch_nodes.values()), itemgetter('count'), reverse=True)
    sorted_list_size = len(sorted_list)
    start_index = ceil(sorted_list_size*5/100)
    #for index in range(start_index, len(sorted_list)):
    penalty = sorted_list_size - start_index
    return penalty

def get_configuration_score(bootstraps_communities, candidate_subset):
    mismatch_penalty = get_configuration_penalty(bootstraps_communities, candidate_subset)
    configuration_score = len(candidate_subset) - 10*mismatch_penalty
    return configuration_score

def generate_new_configuration():
    pass


### Simulated Annealing ###
# Reference : Kirkpatrick S, C D Gelatt J, Vecchi MP (1983) Optimization by simulated annealing. Science 220: 671–680.

def compute_simulated_annealing(bootstraps_communities):
    old_configuration = generate_new_configuration()
    old_score = get_configuration_score(bootstraps_communities, old_configuration)
    T = 1
    keep_going = True
    kept_configurations = [{'config': old_configuration, 'score': old_score}]
    while keep_going and T > 0:
        keep_going = False
        current_configuration = generate_new_configuration()
        current_score = get_configuration_score(bootstraps_communities, current_configuration)
        score_diff = current_score - old_score
        if score_diff > 0 or random.random() < exp(score_diff/T):
            kept_configurations.append({'config': current_configuration, 'score': current_score})
            #old_configuration = current_configuration
            old_score = current_score
            keep_going = True
        T = 0.99*T
    return max(kept_configurations)

### Communities diversity ###

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

def get_nodes_distribution(source_communities, target_communities, one_to_two_nodes_edges_dict):
    """Returns dict keyed by node conveying target community's clusters connection."""
    nodes_links = {}
    target_partition = get_partitions_from_communities(target_communities)
    for community, node_set in source_communities.items():
        for node in node_set:
            node_targets = one_to_two_nodes_edges_dict[node]
            nodes_links[node] = {'total': len(node_targets), 'total_in_core':0, 'core_distribution':{}}
            for target_node in node_targets:
                if target_node in target_partition:# It's in a core !
                    nodes_links[node]['total_in_core'] += 1
                    target_community = target_partition[target_node]
                    if target_community not in nodes_links[node]['core_distribution']:
                        nodes_links[node]['core_distribution'][target_community] = 0
                    nodes_links[node]['core_distribution'][target_community] += 1
    return nodes_links

### Null-Model ###

def null_model_probabilities(target_core_communities, total_target_nodes_count):
    """Compute the null-model probabilities. Low-level, might change,
    use another null-model hypothesis, disappear => don't use it.
    """
    # Hypothesis: multinomial case
    not_in_cores_target_nodes_count = total_target_nodes_count
    probabilities = {}
    for community, node_set in target_core_communities.items():
        community_size = len(node_set)
        probabilities[community] = community_size / total_target_nodes_count
        not_in_cores_target_nodes_count -= community_size
    probabilities['other'] = not_in_cores_target_nodes_count / total_target_nodes_count
    return probabilities

def null_model_expected_value_for_node(node_distribution, target_core_communities, total_target_nodes_count):
    """Returns the expected links distribution across clusters according to the null-model."""
    # Hypothesis: multinomial case
    expected_values = {}
    null_model_probabilities_dict = null_model_probabilities(target_core_communities, total_target_nodes_count)
    for community, community_probability in null_model_probabilities_dict.items():
        expected_values[community] = node_distribution['total']*community_probability
    return expected_values

def nodes_distribution_fingerprint(nodes_distribution, target_core_communities, total_target_nodes_count):
    """Compute the nodes fingerprint: for each node, take the links distribution
    and divide it by the equivalent expected distribution under a null-model hypothesis.
    """
    # Strategy:
    # For each node:
    # Take links count for each clusters and divide
    # by the probabilistic null-model expected values of links count for the given cluster
    nodes_fingerprint = {}
    for node_key, node_dist_dict in nodes_distribution.items():
        nodes_fingerprint[node_key] = {}

        null_model_freq = null_model_expected_value_for_node(node_dist_dict, target_core_communities, total_target_nodes_count)
        for community_key, community_freq in node_dist_dict['core_distribution'].items():
            nodes_fingerprint[node_key][community_key] = community_freq / null_model_freq[community_key]

    return nodes_fingerprint

if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit("USAGE : " + sys.argv[0] + '[srcBinocularsJSON] [semantic GEXF] [socio GEXF]')
    random.seed()
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

        samples_number = 1000
        samples_repetition = 0

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
            for j in range(samples_repetition):
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

        #for i in range(samples_number-1, 0, -1):
        #    for j in range(i):
                #print(j, original_concept_communities[j])
        #        original_concept_communities[j] = get_core_communities_from_two(original_concept_communities[j], original_concept_communities[j+1])
        #        original_actor_communities[j] = get_core_communities_from_two(original_actor_communities[j], original_actor_communities[j+1])

        #original_concept_communities = original_concept_communities[0]
        #original_actor_communities = original_actor_communities[0]

        final_concept_communities = fuse_core_communities(original_concept_communities)
        final_actor_communities = fuse_core_communities(original_actor_communities)

        print(final_concept_communities, len([concept for key, item in final_concept_communities.items() for concept in item]), '/', len(binocular_datastructure['concepts']))
        print(final_actor_communities, len([actor for key, item in final_actor_communities.items() for actor in item]), '/', len(binocular_datastructure['actors']))

        # Links between stabilised communities
#        semantic_to_socio_communities_links = get_basic_communities_diversity(original_concept_communities, original_actor_communities, binocular_datastructure['ca'])
#        socio_to_semantic_communities_links = get_basic_communities_diversity(original_actor_communities, original_concept_communities, binocular_datastructure['ac'])
#        print(semantic_to_socio_communities_links)
#        print(socio_to_semantic_communities_links)

#        semantic_socio_counts = {}
#        socio_semantic_counts = {}
#        for _, communities_set in semantic_to_socio_communities_links.items():
#            c_count = len(communities_set)
#            if c_count not in semantic_socio_counts:
#                semantic_socio_counts[c_count] = 1
#            else:
#                semantic_socio_counts[c_count] += 1

#        for _, communities_set in socio_to_semantic_communities_links.items():
#            c_count = len(communities_set)
#            if c_count not in socio_semantic_counts:
#                socio_semantic_counts[c_count] = 1
#            else:
#                socio_semantic_counts[c_count] += 1
#        print(semantic_socio_counts)
#        print(socio_semantic_counts)

        #null_model_prob = null_model_probabilities(original_concept_communities, len(binocular_datastructure['concepts']))
        #print(null_model_prob)

        nodes_dispatch = get_nodes_distribution(final_actor_communities, final_concept_communities, binocular_datastructure['ac'])
        print(nodes_dispatch)
        #null_model_expected_value_for_node(nodes_dispatch['Julia'], null_model_prob)
        print(nodes_distribution_fingerprint(nodes_dispatch, final_concept_communities, len(binocular_datastructure['concepts'])))

        nx.set_node_attributes(concepts_graph, name='python_class', values=get_partitions_from_communities(final_concept_communities))
        #nx.set_node_attributes(concepts_graph, name='python_class', values=original_concept_partition)
        nx.set_node_attributes(actors_graph, name='python_class', values=get_partitions_from_communities(final_actor_communities))
        #nx.set_node_attributes(actors_graph, name='python_class', values=original_actor_partition)
        nx.write_gexf(concepts_graph, sys.argv[2])
        nx.write_gexf(actors_graph, sys.argv[3])
