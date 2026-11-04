/** Number or switch thresholds, flattened to `group.key`. Lists and text are not edited here. */
export type ThresholdValue = number | boolean;

export function flattenThresholds(
  defaults: Record<string, unknown>,
): { group: string; fields: { path: string; key: string; value: ThresholdValue }[] }[] {
  return Object.entries(defaults).flatMap(([group, values]) => {
    if (typeof values !== 'object' || values === null) return [];
    const fields = Object.entries(values).flatMap(([key, value]) =>
      typeof value === 'number' || typeof value === 'boolean'
        ? [{ path: `${group}.${key}`, key, value }]
        : [],
    );
    return fields.length ? [{ group, fields }] : [];
  });
}

export function readPath(tree: Record<string, unknown>, path: string): unknown {
  const [group, key] = path.split('.') as [string, string];
  const values = tree[group];
  return typeof values === 'object' && values !== null
    ? (values as Record<string, unknown>)[key]
    : undefined;
}

/** Only what differs from the defaults, so a later change of a default still takes effect. */
export function buildOverrides(
  values: Record<string, ThresholdValue>,
  defaults: Record<string, unknown>,
): Record<string, Record<string, ThresholdValue>> {
  const out: Record<string, Record<string, ThresholdValue>> = {};
  for (const [path, value] of Object.entries(values)) {
    if (readPath(defaults, path) === value) continue;
    const [group, key] = path.split('.') as [string, string];
    (out[group] ??= {})[key] = value;
  }
  return out;
}
