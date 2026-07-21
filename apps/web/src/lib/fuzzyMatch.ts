/**
 * Lightweight fuzzy subsequence matcher (fzf/VS Code quick-open style) — query
 * characters must appear in `target` in order, but not contiguously, so "rtbl"
 * matches "repo-table". Scores reward contiguous runs and word-boundary starts
 * so tighter, more relevant matches sort first.
 */
export interface FuzzyMatch {
  score: number;
  /** Matched character indices in `target`, for highlighting. */
  indices: number[];
}

const BOUNDARY = /[\s\-_/.]/;

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query.trim()) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const indices: number[] = [];
  let qi = 0;
  let prevMatchIndex = -1;
  let consecutiveRun = 0;
  let score = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    indices.push(ti);
    if (prevMatchIndex === ti - 1) {
      consecutiveRun++;
      score += 8 + consecutiveRun * 4;
    } else {
      consecutiveRun = 0;
      score += 2;
    }
    if (ti === 0 || BOUNDARY.test(target[ti - 1] ?? "")) {
      score += 10;
    }
    prevMatchIndex = ti;
    qi++;
  }

  if (qi < q.length) return null; // not every query char was found, in order

  const spread = indices[indices.length - 1]! - indices[0]!;
  score -= spread * 0.5;
  score -= target.length * 0.1;

  return { score, indices };
}

/** Filters + ranks items by fuzzy match score (best first); non-matches are dropped. */
export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): Array<{ item: T; indices: number[] }> {
  if (!query.trim()) return items.map((item) => ({ item, indices: [] }));
  const scored: Array<{ item: T; score: number; indices: number[] }> = [];
  for (const item of items) {
    const m = fuzzyMatch(query, getText(item));
    if (m) scored.push({ item, score: m.score, indices: m.indices });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map(({ item, indices }) => ({ item, indices }));
}
