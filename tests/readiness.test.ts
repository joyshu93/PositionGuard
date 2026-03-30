import { assessReadiness, formatTrackedAssetPreference, parseTrackedAssets } from "../src/readiness.js";
import type { UserStateBundle } from "../src/domain/types.js";
import { assert, assertEqual } from "./test-helpers.js";

const baseState: UserStateBundle = {
  user: {
    id: 1,
    telegramUserId: "1",
    telegramChatId: "100",
    username: "tester",
    displayName: "Tester",
    trackedAssets: "BTC,ETH",
    sleepModeEnabled: false,
    onboardingComplete: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  accountState: {
    id: 10,
    userId: 1,
    availableCash: 500000,
    reportedAt: "2026-01-01T00:00:00.000Z",
    source: "USER_REPORTED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  positions: {
    BTC: {
      id: 11,
      userId: 1,
      asset: "BTC",
      quantity: 0.25,
      averageEntryPrice: 95000000,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
};

assertEqual(
  parseTrackedAssets("BTC").join(","),
  "BTC",
  "BTC preference should parse cleanly.",
);
assertEqual(
  parseTrackedAssets("ETH").join(","),
  "ETH",
  "ETH preference should parse cleanly.",
);
assertEqual(
  parseTrackedAssets("BTC,ETH").join(","),
  "BTC,ETH",
  "Dual tracked asset preference should parse cleanly.",
);
assertEqual(
  formatTrackedAssetPreference(["BTC"]),
  "BTC",
  "Single BTC tracked asset should serialize cleanly.",
);
assertEqual(
  formatTrackedAssetPreference(["ETH"]),
  "ETH",
  "Single ETH tracked asset should serialize cleanly.",
);
assertEqual(
  formatTrackedAssetPreference(["BTC", "ETH"]),
  "BTC,ETH",
  "Two tracked assets should serialize to the dual-asset preference.",
);

const btcOnly = assessReadiness({
  ...baseState,
  user: { ...baseState.user, trackedAssets: "BTC" },
});

assert(btcOnly.isReady, "BTC-only users should be ready when cash and BTC are recorded.");
assertEqual(
  btcOnly.missingItems.length,
  0,
  "BTC-only readiness should not report missing items when setup is complete.",
);

const ethOnly = assessReadiness({
  ...baseState,
  user: { ...baseState.user, trackedAssets: "ETH" },
  positions: {
    ETH: {
      id: 12,
      userId: 1,
      asset: "ETH",
      quantity: 1.2,
      averageEntryPrice: 3500000,
      reportedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  },
});

assert(ethOnly.isReady, "ETH-only users should be ready when cash and ETH are recorded.");
assertEqual(
  ethOnly.missingItems.length,
  0,
  "ETH-only readiness should not report missing items when setup is complete.",
);

const bothAssets = assessReadiness({
  ...baseState,
  user: { ...baseState.user, trackedAssets: "BTC,ETH" },
});

assert(
  !bothAssets.isReady,
  "Both-asset tracking should remain incomplete when ETH is missing.",
);
assert(
  bothAssets.missingItems.includes("ETH position"),
  "Both-asset readiness should clearly report the missing ETH record.",
);
assert(
  !bothAssets.missingItems.includes("BTC position"),
  "Both-asset readiness should not report BTC as missing when it is present.",
);
