/**
 * hh-style numbered pagination: first, last, current ± `around`, with gaps.
 * `pageItems(6, 20)` → `[1, 'gap', 4, 5, 6, 7, 8, 'gap', 20]`
 */
export function pageItems(current: number, total: number, around = 2): (number | 'gap')[] {
  if (total <= 1) return [1];
  const pages = new Set<number>([1, total]);
  for (let p = current - around; p <= current + around; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0) {
      const prev = sorted[i - 1];
      if (p - prev === 2) out.push(prev + 1);
      else if (p - prev > 2) out.push('gap');
    }
    out.push(p);
  });
  return out;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}
