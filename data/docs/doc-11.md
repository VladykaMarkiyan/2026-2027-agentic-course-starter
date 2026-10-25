# Reciprocal Rank Fusion (RRF) Algorithm

Reciprocal Rank Fusion (RRF) is an unsupervised score fusion method that combines ranked retrieval results from multiple distinct retrieval channels (such as lexical BM25 and dense vector search).

The RRF score for document chunk d across retrieval methods M is computed as:
RRF_score(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}

Where:
- r_m(d) is the rank (position, starting at 1) of document chunk d in retrieval list m. If d is not present in list m, its rank contribution is 0.
- k is a constant smoothing hyperparameter (typically set to 60 as established by Cormack et al., SIGIR 2009).

Properties of RRF:
- It eliminates the need to normalize and calibrate drastically different raw score distributions (e.g. unconstrained BM25 scores vs bounded cosine similarity [-1, 1]).
- High consensus across both channels produces the highest fused ranks.
