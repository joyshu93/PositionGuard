import type { UserStateBundle } from "../src/domain/types.js";
import { assessSetupCompleteness, renderStatusMessage } from "../src/status.js";
import { assert, assertEqual } from "./test-helpers.js";

const baseState: UserStateBundle = {
  user: {
    id: 1,
    telegramUserId: "1",
    telegramChatId: "100",
    username: "tester",
    displayName: "Tester",
    sleepModeEnabled: false,
    onboardingComplete: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  accountState: null,
  positions: {},
};

const completeness = assessSetupCompleteness(baseState);
assertEqual(completeness.hasCash, false, "Setup completeness should detect missing cash.");
assertEqual(completeness.isComplete, false, "Setup completeness should remain false when setup is missing.");

const emptyStatus = renderStatusMessage(null);
assert(
  emptyStatus.includes("/setposition <BTC|ETH> <quantity> <average-entry-price>"),
  "Empty status should explain how to record position state.",
);
assert(
  emptyStatus.includes("This bot records manual state only. It does not execute trades."),
  "Empty status should preserve record-only wording.",
);

const fullStatus = renderStatusMessage({
  ...baseState,
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

assert(fullStatus.includes("Setup completeness: complete"), "Full status should report complete setup.");
assert(fullStatus.includes("Sleep mode: off"), "Full status should render sleep mode.");
assert(fullStatus.includes("BTC spot record: 0.25 @ avg 95,000,000 KRW"), "Full status should render BTC state.");
assert(fullStatus.includes("ETH spot record: 1.2 @ avg 3,500,000 KRW"), "Full status should render ETH state.");
assert(fullStatus.includes("Missing setup items: none"), "Full status should show no missing setup items.");

const statusWithAlerts = renderStatusMessage(
  {
    ...baseState,
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
  },
  [
    {
      deliveryStatus: "SENT",
      reasonKey: "setup-incomplete",
      eventType: "ACTION_NEEDED",
      createdAt: "2026-01-01T02:00:00.000Z",
      suppressedBy: null,
    },
  ],
);

assert(
  statusWithAlerts.includes("Recent alerts:"),
  "Status output should surface recent alert history.",
);
assert(
  statusWithAlerts.includes("SENT setup-incomplete"),
  "Status output should include a compact recent alert summary.",
);
