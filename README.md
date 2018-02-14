# Socio-Semantic bubbles - code repository

## Overview
### clusters_stats.py

This Python script generate data used in visualisations.
It constitutes the "core communities" of the social and semantic networks,
by applying the Louvain method (heuristic Modularity maximisation) several
times and fusing the results.

### raw/alluvial-custom.js

This Javascript code is actually a RawGraphs' alluvial chart with things added.
The produced visualisation is not readable, so useless.

### d3-only/matrix_view.html

Javascript d3 code to generate a colored and communities grouped adjacency
matrix visualisation.
