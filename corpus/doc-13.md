# Vector Embeddings, Dot Product and Cosine Similarity

Dense vector representations capture latent semantic relationships between queries and text passages.

1. Cosine Similarity Formula:
sim(A, B) = \frac{A \cdot B}{\|A\| \|B\|} = \frac{\sum_{i=1}^n A_i B_i}{\sqrt{\sum_{i=1}^n A_i^2} \sqrt{\sum_{i=1}^n B_i^2}}

2. Normalized Vectors:
When embedding vectors are L2-normalized during indexing (\|A\| = 1), cosine similarity is mathematically equivalent to the simple dot product (inner product):
sim(A, B) = A \cdot B = \sum_{i=1}^n A_i B_i

Dense embeddings effectively handle paraphrasing, synonymous technical terms, and semantic intent matching, complementing keyword-based BM25.
