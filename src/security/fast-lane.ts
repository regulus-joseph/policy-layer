export interface FastLaneMap {
  counts: Map<string, number>;
  timestamps: Map<string, number>;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

const fastLaneState: FastLaneMap = {
  counts: new Map(),
  timestamps: new Map(),
};

export function onApprove(pattern: string): void {
  const now = Date.now();
  const lastTs = fastLaneState.timestamps.get(pattern);

  if (lastTs !== undefined && now - lastTs > ONE_HOUR_MS) {
    fastLaneState.counts.set(pattern, 1);
    fastLaneState.timestamps.set(pattern, now);
    return;
  }

  const current = fastLaneState.counts.get(pattern) ?? 0;
  fastLaneState.counts.set(pattern, current + 1);
  fastLaneState.timestamps.set(pattern, now);
}

export function isFastLane(pattern: string): boolean {
  return (fastLaneState.counts.get(pattern) ?? 0) >= 5;
}

export function resetFastLane(pattern?: string): void {
  if (pattern !== undefined) {
    fastLaneState.counts.delete(pattern);
    fastLaneState.timestamps.delete(pattern);
  } else {
    fastLaneState.counts.clear();
    fastLaneState.timestamps.clear();
  }
}
