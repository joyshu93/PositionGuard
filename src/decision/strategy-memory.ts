import type { SupportedAsset } from "../domain/types.js";

export type StrategyMemoryResetMap = Partial<Record<SupportedAsset, string | null>>;

export function isOnOrAfterStrategyReset(
  createdAt: string,
  resetAt: string | null | undefined,
): boolean {
  if (!resetAt) {
    return true;
  }

  const createdAtMs = Date.parse(createdAt);
  const resetAtMs = Date.parse(resetAt);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(resetAtMs)) {
    return true;
  }

  return createdAtMs >= resetAtMs;
}

export function filterRecordsOnOrAfterStrategyReset<T extends { createdAt: string }>(
  records: T[],
  resetAt: string | null | undefined,
): T[] {
  return records.filter((record) => isOnOrAfterStrategyReset(record.createdAt, resetAt));
}

export function takeLatestRecordOnOrAfterStrategyReset<T extends { createdAt: string }>(
  record: T | null | undefined,
  resetAt: string | null | undefined,
): T | null {
  if (!record) {
    return null;
  }

  return isOnOrAfterStrategyReset(record.createdAt, resetAt) ? record : null;
}

export function filterAssetScopedRecordsOnOrAfterStrategyReset<
  T extends { asset: SupportedAsset | null; createdAt: string },
>(
  records: T[],
  resetMap: StrategyMemoryResetMap,
): T[] {
  return records.filter((record) => {
    if (record.asset === null) {
      return true;
    }

    return isOnOrAfterStrategyReset(record.createdAt, resetMap[record.asset] ?? null);
  });
}
