import type {
  PositionState,
  SupportedAsset,
  TrackedAssetPreference,
  UserStateBundle,
} from "./domain/types.js";

export interface ReadinessSnapshot {
  trackedAssets: SupportedAsset[];
  hasCashRecord: boolean;
  readyPositionAssets: SupportedAsset[];
  isReady: boolean;
  missingItems: string[];
}

export function parseTrackedAssets(
  preference: TrackedAssetPreference | null | undefined,
): SupportedAsset[] {
  if (preference === "BTC") {
    return ["BTC"];
  }

  if (preference === "ETH") {
    return ["ETH"];
  }

  return ["BTC", "ETH"];
}

export function formatTrackedAssetPreference(
  trackedAssets: readonly SupportedAsset[],
): TrackedAssetPreference {
  if (trackedAssets.length === 1 && trackedAssets[0] === "BTC") {
    return "BTC";
  }

  if (trackedAssets.length === 1 && trackedAssets[0] === "ETH") {
    return "ETH";
  }

  return "BTC,ETH";
}

export function assessReadiness(
  userState: Pick<UserStateBundle, "user" | "accountState" | "positions">,
): ReadinessSnapshot {
  const trackedAssets = parseTrackedAssets(userState.user.trackedAssets);
  const hasCashRecord = userState.accountState !== null;
  const readyPositionAssets = trackedAssets.filter(
    (asset) => userState.positions[asset] !== undefined,
  );
  const missingItems: string[] = [];

  if (!hasCashRecord) {
    missingItems.push("cash");
  }

  for (const asset of trackedAssets) {
    if (userState.positions[asset] === undefined) {
      missingItems.push(`${asset} position`);
    }
  }

  return {
    trackedAssets,
    hasCashRecord,
    readyPositionAssets,
    isReady: missingItems.length === 0,
    missingItems,
  };
}

export function isTrackedAsset(
  trackedAssets: readonly SupportedAsset[],
  asset: SupportedAsset,
): boolean {
  return trackedAssets.includes(asset);
}

export function getTrackedPositionRecords(
  trackedAssets: readonly SupportedAsset[],
  positions: Partial<Record<SupportedAsset, PositionState>>,
): PositionState[] {
  return trackedAssets
    .map((asset) => positions[asset])
    .filter((position): position is PositionState => position !== undefined);
}
