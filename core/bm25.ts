// Okapi BM25 over small, page-sized corpora.

export interface Bm25Index {
  docs: Map<string, number>[];
  lengths: number[];
  df: Map<string, number>;
  avgdl: number;
}

export interface Bm25Hit {
  score: number;
  /** Matched terms with their contribution, strongest first. */
  matched: [string, number][];
}

export function buildIndex(docs: string[][]): Bm25Index {
  const df = new Map<string, number>();
  const counts = docs.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return tf;
  });
  const lengths = docs.map((d) => d.length);
  const avgdl = lengths.reduce((a, b) => a + b, 0) / Math.max(docs.length, 1) || 1;
  return { docs: counts, lengths, df, avgdl };
}

export function scoreDoc(
  index: Bm25Index,
  i: number,
  query: Record<string, number>,
  k1 = 1.2,
  b = 0.75,
): Bm25Hit {
  const tf = index.docs[i];
  if (!tf) return { score: 0, matched: [] };
  const n = index.docs.length;
  const len = index.lengths[i] ?? 0;
  const matched: [string, number][] = [];
  let score = 0;
  for (const [term, weight] of Object.entries(query)) {
    const f = tf.get(term);
    if (!f) continue;
    const df = index.df.get(term) ?? 0;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    const part = weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / index.avgdl)));
    score += part;
    matched.push([term, part]);
  }
  matched.sort((x, y) => y[1] - x[1]);
  return { score, matched };
}
