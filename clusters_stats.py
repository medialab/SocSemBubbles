import json, sys
import networkx as nx
import community
from operator import itemgetter
from math import ceil
from math import floor
from math import exp
from math import sqrt
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

def align_bootstraps(bootstraps_list, bootstrap_index):
    """Return boostraps alignment (and their intersection set)."""
    smaller_community_anchor = False

    within_boostrap_community_index = list(bootstraps_list[bootstrap_index].keys())[0]
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
    return (current_bootstrap_alignment, current_community_anchor_set)

def get_mismatch_from_alignment(bootstraps_list, bootstrap_alignment, intersection_set):
    """Return the mismatch nodes of a given alignment relatively to given intersection set."""
    mismatch_dict = {}
    for b_index, c_index in enumerate(bootstrap_alignment):
        if c_index != -1:
            current_community = bootstraps_list[b_index][c_index]
            for mismatched_node in current_community - intersection_set:
                if mismatched_node not in mismatch_dict:
                    mismatch_dict[mismatched_node] = 1
                else:
                    mismatch_dict[mismatched_node] += 1
    return mismatch_dict

def fuse_core_communities(bootstraps_list, confidence_threshold):
    """Fuse bootstraps core communities by taking smaller clusters, aligning
    them and taking confidence_threshold intersection (aka: the intersection across all bootstraps
    + nodes present in 95% of bootstraps' took clusters).
    """
    something_clustered = True
    cluster_stack = []
    while something_clustered:
        something_clustered = False

        bootstrap_index = 0
        while bootstrap_index < len(bootstraps_list) and bootstraps_list[bootstrap_index] == {}:
            bootstrap_index += 1
        if bootstrap_index == len(bootstraps_list):
            continue

        (current_bootstrap_alignment, current_community_anchor_set) = align_bootstraps(bootstraps_list, bootstrap_index)

        # We have a plausible community alignment, now start to make the confidence_threshold merge
        ## Intersection (by the way, check if we really aligned more than one bootstrap - aka we clustered something)
        tmp_intersection_set = current_community_anchor_set.copy()
        for b_index, c_index in enumerate(current_bootstrap_alignment):
            if c_index != -1:
                tmp_intersection_set &= bootstraps_list[b_index][c_index]
                something_clustered = True

        ## Mismatch counting
        mismatch_dict = get_mismatch_from_alignment(bootstraps_list, current_bootstrap_alignment, tmp_intersection_set)

        ## Remerging highly mismatched (ie highly present in bootstraps, but not all) nodes
        mismatch_list = [{'node': node_key, 'count': node_count} for node_key, node_count in mismatch_dict.items()]
        remerged_threshold = floor(len(bootstraps_list)*confidence_threshold)
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

def get_nodes_distribution(source_to_target_node_links, source_core_communities, target_core_communities):
    """Returns dict keyed by node conveying target community's clusters connection."""
    nodes_links = {}
    target_partition = get_partitions_from_communities(target_core_communities)
    for community, node_set in source_core_communities.items():
        for node in node_set:
            node_targets = source_to_target_node_links[node]
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

def null_model_probabilities(total_target_nodes_count, target_core_communities):
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

def null_model_expected_value_for_node(total_target_nodes_count, total_node_links, target_core_communities):
    """Returns the expected links distribution across clusters according to the null-model."""
    # Hypothesis: multinomial case
    expected_values = {}
    null_model_probabilities_dict = null_model_probabilities(total_target_nodes_count, target_core_communities)
    for community, community_probability in null_model_probabilities_dict.items():
        expected_values[community] = total_node_links*community_probability
    return expected_values

### Fingerprint ###

def hhi(values_list):
    total = sum(values_list)
    h = 0
    for S in values_list:
        h += (S/total)**2
    return h

def get_relevant_fingerprints(nodes_fingerprint):
    relevant_fingerprints = {}
    for node_key, node_fing_dict in nodes_fingerprint.items():
        relevant_fingerprints[node_key] = {}
        fingerprint_list = [{'key': k, 'value':v} for k, v in node_fing_dict.items()]
        fingerprint_values = [v['value'] for v in fingerprint_list]
        h = hhi(fingerprint_values)
        relevant_number = max(1, floor(1/h))
        sorted_fingerprints = sorted(fingerprint_list, key=itemgetter('value'), reverse=True)
        relevant_fingerprints_list = sorted_fingerprints[:relevant_number]
        for fingerprint in relevant_fingerprints_list:
            fingerprint_key = fingerprint['key']
            fingerprint_value = fingerprint['value']
            relevant_fingerprints[node_key][fingerprint_key] = fingerprint_value
    return relevant_fingerprints

def nodes_distribution_fingerprint(total_target_nodes_count, nodes_distribution, target_core_communities):
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

        null_model_freq = null_model_expected_value_for_node(total_target_nodes_count, node_dist_dict['total'], target_core_communities)
        for community_key, community_freq in node_dist_dict['core_distribution'].items():
            nodes_fingerprint[node_key][community_key] = community_freq / null_model_freq[community_key]

    return nodes_fingerprint

def median_with_geometric_interpolation(l):
    """Naive implementation of 'geometric' median (aka median with geometric mean
    interpolation in case of an even-numbered list size).
    Different from the mathematical geometric median (which is basically multidimensionnal median).
    """
    # Naive implementation, because we do not (yet) need something clever
    tmp = sorted(l)
    size = len(tmp)
    if size % 2 == 1:
        return tmp[floor(size/2)]
    else:
        return sqrt(tmp[size//2-1]*tmp[size//2])

def communities_distribution_by_median(nodes_fingerprint, source_communities):
    """Compute source communities fingerprint by taking its nodes' median for each
    target community (the ones which are fingerprinted).
    """
    communities_median_distribution = {}
    for community_id, nodes_list in source_communities.items():
        communities_median_distribution[community_id] = {}
        for node in nodes_list:
            for target_community_key, target_community_value in nodes_fingerprint[node].items():
                if target_community_key not in communities_median_distribution[community_id]:
                    communities_median_distribution[community_id][target_community_key] = [target_community_value]
                else:
                    communities_median_distribution[community_id][target_community_key].append(target_community_value)
        for target_community_key in communities_median_distribution[community_id].keys():
            communities_median_distribution[community_id][target_community_key] = median_with_geometric_interpolation(communities_median_distribution[community_id][target_community_key])
    return communities_median_distribution

def communities_distribution_by_overall_fingerprint(total_target_nodes_count, nodes_distribution, source_core_communities, target_core_communities):
    """Compute each source communities fingerprint by grouping all its nodes' links into a virtual
    node representing the overall source community, and computing the fingerprint of that
    virtual node.
    """
    communities_distribution = {}
    for community_key, nodes_set in source_core_communities.items():
        communities_distribution[community_key] = {'total': 0, 'total_in_core':0, 'core_distribution':{}}
        for community_node in nodes_set:
            communities_distribution[community_key]['total'] += nodes_distribution[community_node]['total']
            communities_distribution[community_key]['total_in_core'] += nodes_distribution[community_node]['total_in_core']
            for target_community_key, target_community_key_weight in nodes_distribution[community_node]['core_distribution'].items():
                if target_community_key not in communities_distribution[community_key]['core_distribution']:
                    communities_distribution[community_key]['core_distribution'][target_community_key] = target_community_key_weight
                else:
                    communities_distribution[community_key]['core_distribution'][target_community_key] += target_community_key_weight
    #print(communities_fingerprint)
    return nodes_distribution_fingerprint(total_target_nodes_count, communities_distribution, target_core_communities)


def generate_core_communities(graph, samples_number, confidence_threshold = 95/100):
    """Generate core communities with given confidence threshold."""
    original_communities = [None]*samples_number
    for i in range(samples_number):
        original_communities[i] = get_communities_from_partitions(community.best_partition(graph, randomize=True))
    return fuse_core_communities(original_communities, confidence_threshold)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit("USAGE : " + sys.argv[0] + '[srcBinocularsJSON] [semantic GEXF] [socio GEXF]')
    random.seed()
    with open(sys.argv[1], 'r') as f:
        binocular_datastructure = json.load(f)

        # Draw the actors and concept graphs (used for Louvain community detection)
        # + bipartite graph
        bipartite_graph = nx.Graph()
        concepts_graph = nx.Graph()
        for concept, item in binocular_datastructure['concepts'].items():
            concepts_graph.add_node(concept, freq=item['frequency'])
            bipartite_graph.add_node(concept, freq=item['frequency'])
            for target_concept, w in binocular_datastructure['cc'][concept].items():
                concepts_graph.add_edge(min(concept, target_concept), max(concept, target_concept), weight=w)
                bipartite_graph.add_edge(min(concept, target_concept), max(concept, target_concept), weight=w)

        actors_graph = nx.Graph()
        for actor, item in binocular_datastructure['actors'].items():
            actors_graph.add_node(actor, freq=item['frequency'])
            bipartite_graph.add_node(actor, freq=item['frequency'])
            for target_actor, w in binocular_datastructure['aa'][actor].items():
                actors_graph.add_edge(min(actor, target_actor), max(actor, target_actor), weight=w)
                bipartite_graph.add_edge(min(actor, target_actor), max(actor, target_actor), weight=w)

        for actor, concept_dict in binocular_datastructure['ac'].items():
            for concept, w in concept_dict.items():
                bipartite_graph.add_edge(actor, concept, weight=w)

        final_concept_communities = generate_core_communities(concepts_graph, 1000, 95/100)
        final_actor_communities = generate_core_communities(actors_graph, 1000, 95/100)

        node_community_dict = {}
        for community_key, node_set in final_concept_communities.items():
            for node in node_set:
                node_community_dict[node] = 'c'+str(community_key)

        for community_key, node_set in final_actor_communities.items():
            for node in node_set:
                node_community_dict[node] = 'a'+str(community_key)

        nx.set_node_attributes(bipartite_graph, name='python_modularity_class', values=node_community_dict)
        #nx.write_gexf(bipartite_graph, sys.argv[2])

        print(final_concept_communities, len([concept for key, item in final_concept_communities.items() for concept in item]), '/', len(binocular_datastructure['concepts']))
        print(final_actor_communities, len([actor for key, item in final_actor_communities.items() for actor in item]), '/', len(binocular_datastructure['actors']))

        actor_nodes_dispatch = get_nodes_distribution(binocular_datastructure['ac'], final_actor_communities, final_concept_communities)
        concept_nodes_dispatch = get_nodes_distribution(binocular_datastructure['ca'], final_concept_communities, final_actor_communities)
        print(actor_nodes_dispatch)
        nodes_f = nodes_distribution_fingerprint(len(binocular_datastructure['concepts']), actor_nodes_dispatch, final_concept_communities)
        print(nodes_f)
        print()
        print(communities_distribution_by_median(nodes_f, final_actor_communities))
        actor_fingerprint = communities_distribution_by_overall_fingerprint(len(binocular_datastructure['concepts']), actor_nodes_dispatch, final_actor_communities, final_concept_communities)
        concept_fingerprint = communities_distribution_by_overall_fingerprint(len(binocular_datastructure['actors']), concept_nodes_dispatch, final_concept_communities, final_actor_communities)
        print(actor_fingerprint)
        with open(sys.argv[2], 'w') as g, open(sys.argv[3], 'w') as h:
            actor_dict = []
            concept_dict = []

            for source_community, distribution in actor_fingerprint.items():
                community_nodes = final_actor_communities[source_community]
                for target_community, w in distribution.items():
                    # UGLY
                    considered_source_nodes = []
                    considered_target_nodes = []
                    target_full_nodes_set = set(final_concept_communities[target_community])
                    target_reached_nodes_set = set()

                    for community_node in community_nodes:
                        considered_source_nodes.append({
                        'name': community_node,
                        'present': target_community in actor_nodes_dispatch[community_node]['core_distribution']
                        })

                        # Add to the actual reached nodes set the target communities nodes reached by current source node
                        target_reached_nodes_set |= set(binocular_datastructure['ac'][community_node].keys()) & target_full_nodes_set

                    for target_node in target_full_nodes_set:
                        considered_target_nodes.append({
                        'name': target_node,
                        'present': target_node in target_reached_nodes_set
                        })
                        
                    actor_dict.append({
                    'Implied_actors_source_nodes': json.dumps(considered_source_nodes),
                    'Implied_concepts_target_nodes': json.dumps(considered_target_nodes),
                    'Actor_community': source_community,
                    'Concept_target': target_community,
                    'Weight': w
                    })
            json.dump(actor_dict, h)

            for source_community, distribution in concept_fingerprint.items():
                community_nodes = final_concept_communities[source_community]
                for target_community, w in distribution.items():
                    # UGLY
                    considered_source_nodes = []
                    considered_target_nodes = []
                    target_full_nodes_set = set(final_actor_communities[target_community])
                    target_reached_nodes_set = set()

                    for community_node in community_nodes:
                        considered_source_nodes.append({
                        'name': community_node,
                        'present': target_community in concept_nodes_dispatch[community_node]['core_distribution']
                        })

                        # Add to the actual reached nodes set the target communities nodes reached by current source node
                        target_reached_nodes_set |= set(binocular_datastructure['ca'][community_node].keys()) & target_full_nodes_set

                    for target_node in target_full_nodes_set:
                        considered_target_nodes.append({
                        'name': target_node,
                        'present': target_node in target_reached_nodes_set
                        })

                    concept_dict.append({
                    'Implied_concepts_source_nodes': json.dumps(considered_source_nodes),
                    'Implied_actors_target_nodes': json.dumps(considered_target_nodes),
                    'Concept_community': source_community,
                    'Actor_target': target_community,
                    'Weight': w
                    })
            json.dump(concept_dict, g)
#        nx.set_node_attributes(concepts_graph, name='python_class', values=get_partitions_from_communities(final_concept_communities))
        #nx.set_node_attributes(concepts_graph, name='python_class', values=original_concept_partition)
#        nx.set_node_attributes(actors_graph, name='python_class', values=get_partitions_from_communities(final_actor_communities))
        #nx.set_node_attributes(actors_graph, name='python_class', values=original_actor_partition)
#        nx.write_gexf(concepts_graph, sys.argv[2])
#        nx.write_gexf(actors_graph, sys.argv[3])
