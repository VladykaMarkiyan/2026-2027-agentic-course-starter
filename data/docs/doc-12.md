# BM25 Okapi Algorithm & Lexical Scoring Parameters

Okapi BM25 is a non-linear term-frequency / inverse-document-frequency ranking function used in lexical search.

Score formula for query Q consisting of terms q_i:
Score_{BM25}(D, Q) = \sum_{i=1}^{n} IDF(q_i) \cdot \frac{f(q_i, D) \cdot (k_1 + 1)}{f(q_i, D) + k_1 \cdot (1 - b + b \cdot \frac{|D|}{avgdl})}

Parameters:
- k_1: Term frequency saturation parameter (typically between 1.2 and 2.0; standard default is 1.5).
- b: Document length normalization parameter (0 <= b <= 1; standard default is 0.75).
- |D| and avgdl: Length of current document chunk and average document chunk length across the corpus.

BM25 excels at exact keyword matching, acronym lookup, identifiers, and specific technical codes where dense vector search might suffer from out-of-vocabulary or semantic drift.
