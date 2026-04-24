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
    trackedAssets: "BTC,ETH",
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
assertEqual(
  completeness.trackedAssets.join(","),
  "BTC,ETH",
  "Setup completeness should preserve the tracked asset preference.",
);

const emptyStatus = renderStatusMessage(null);
const emptyStatusKo = renderStatusMessage(null, [], "ko");
assert(
  emptyStatus.includes("Tracked assets default to BTC and ETH until you choose otherwise."),
  "Empty status should explain the default tracked assets.",
);
assert(
  emptyStatus.includes("/setposition <BTC|ETH> <quantity> <average-entry-price>"),
  "Empty status should explain how to record position state.",
);
assert(
  emptyStatus.includes("This bot records manual state only. It does not execute trades."),
  "Empty status should preserve record-only wording.",
);
assert(
  emptyStatusKo.includes("\uC544\uC9C1 \uC800\uC7A5\uB41C \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.") &&
    emptyStatusKo.includes("/setcash <amount>"),
  "Korean empty status should render localized guidance.",
);

const fullStatus = renderStatusMessage({
  ...baseState,
  user: {
    ...baseState.user,
    trackedAssets: "BTC,ETH",
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
const fullStatusKo = renderStatusMessage({
  ...baseState,
  user: {
    ...baseState.user,
    trackedAssets: "BTC,ETH",
    locale: "ko",
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
}, [], "ko");

assert(fullStatus.includes("Tracked assets: BTC, ETH"), "Full status should report tracked assets.");
assert(fullStatus.includes("Setup readiness: ready"), "Full status should report ready setup.");
assert(fullStatus.includes("Sleep mode: off"), "Full status should render sleep mode.");
assert(fullStatus.includes("BTC spot record: 0.25 @ avg 95,000,000 KRW"), "Full status should render BTC state.");
assert(fullStatus.includes("ETH spot record: 1.2 @ avg 3,500,000 KRW"), "Full status should render ETH state.");
assert(fullStatus.includes("Missing next steps: none"), "Full status should show no missing next steps.");
assert(
  fullStatusKo.includes("\uCD94\uC801 \uC790\uC0B0: BTC, ETH") &&
    fullStatusKo.includes("\uC124\uC815 \uC900\uBE44\uB3C4: \uC900\uBE44 \uC644\uB8CC"),
  "Full status should render localized Korean labels when requested.",
);

const statusWithAlerts = renderStatusMessage(
  {
    ...baseState,
    user: {
      ...baseState.user,
      trackedAssets: "BTC,ETH",
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
  statusWithAlerts.includes("Sent | Market review alert"),
  "Status output should include a plain-language recent alert summary.",
);

const btcOnlyStatus = renderStatusMessage({
  ...baseState,
  user: {
    ...baseState.user,
    trackedAssets: "BTC",
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
});

assert(
  btcOnlyStatus.includes("Tracked assets: BTC"),
  "BTC-only status should show the selected tracked asset.",
);
assert(
  btcOnlyStatus.includes("Setup readiness: ready"),
  "BTC-only setup should be ready when BTC data is complete.",
);
assert(
  btcOnlyStatus.includes("Missing next steps: none"),
  "BTC-only setup should not report missing items once BTC is complete.",
);

const ethOnlyStatus = renderStatusMessage({
  ...baseState,
  user: {
    ...baseState.user,
    trackedAssets: "ETH",
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

assert(
  ethOnlyStatus.includes("Tracked assets: ETH"),
  "ETH-only status should show the selected tracked asset.",
);
assert(
  ethOnlyStatus.includes("Setup readiness: ready"),
  "ETH-only setup should be ready when ETH data is complete.",
);
assert(
  ethOnlyStatus.includes("Missing next steps: none"),
  "ETH-only setup should not report missing items once ETH is complete.",
);
