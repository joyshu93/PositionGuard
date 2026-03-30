import type { D1DatabaseLike, D1PreparedStatement } from "../src/db/db.js";
import {
  buildHourlyHealthInspection,
  getHourlyHealthInspection,
  getLatestDecisionLogInspection,
  getLatestNotificationEventInspection,
  listRecentDecisionLogInspections,
  listRecentNotificationEventInspections,
  mapDecisionLogInspection,
  mapNotificationEventInspection,
} from "../src/db/operator-visibility.js";
import type {
  DecisionLogRecord,
  NotificationEventRecord,
} from "../src/types/persistence.js";
import { assert, assertEqual } from "./test-helpers.js";

const decisionRecord: DecisionLogRecord = {
  id: 1,
  userId: 42,
  asset: "BTC",
  symbol: "KRW-BTC",
  decisionStatus: "ACTION_NEEDED",
  summary: "Manual setup is incomplete.",
  reasons: ["Missing cash record."],
  actionable: true,
  notificationEmitted: true,
  context: {
    diagnostics: {
      marketData: {
        ok: true,
      },
      notificationState: {
        sent: true,
        suppressedBy: null,
      },
    },
  },
  createdAt: "2026-01-01T03:00:00.000Z",
};

const notificationRecord: NotificationEventRecord = {
  id: 7,
  userId: 42,
  decisionLogId: 1,
  asset: "BTC",
  reasonKey: "setup:cash",
  deliveryStatus: "SKIPPED",
  eventType: "ACTION_NEEDED",
  channel: "telegram",
  payload: {
    message: "Manual setup is incomplete.",
  },
  sentAt: null,
  cooldownUntil: "2026-01-01T06:00:00.000Z",
  suppressedBy: "cooldown",
  createdAt: "2026-01-01T03:05:00.000Z",
};

const mappedDecision = mapDecisionLogInspection(decisionRecord);
assertEqual(
  mappedDecision.market,
  "KRW-BTC",
  "Decision log inspection should preserve the market symbol.",
);
assertEqual(
  mappedDecision.summary,
  "Manual setup is incomplete.",
  "Decision log inspection should preserve the persisted summary.",
);
assertEqual(
  mappedDecision.notificationSent,
  true,
  "Decision log inspection should preserve the notification flag.",
);

const mappedNotification = mapNotificationEventInspection(notificationRecord);
assertEqual(
  mappedNotification.reasonKey ?? null,
  "setup:cash",
  "Notification event inspection should preserve the reason key.",
);
assertEqual(
  mappedNotification.deliveryStatus,
  "SKIPPED",
  "Notification event inspection should preserve the delivery status.",
);
assertEqual(
  mappedNotification.suppressedBy ?? null,
  "cooldown",
  "Notification event inspection should preserve the suppression reason.",
);

const db = createMockDb(
  [
    {
      id: 1,
      user_id: 42,
      asset: "BTC",
      symbol: "KRW-BTC",
      decision_status: "SETUP_INCOMPLETE",
      summary: "Manual setup is incomplete.",
      reasons_json: JSON.stringify(["Missing cash record."]),
      actionable: 0,
      notification_emitted: 0,
      context_json: JSON.stringify({
        diagnostics: {
          marketData: { ok: true },
        },
      }),
      created_at: "2026-01-01T02:00:00.000Z",
    },
    {
      id: 2,
      user_id: 42,
      asset: "ETH",
      symbol: "KRW-ETH",
      decision_status: "NO_ACTION",
      summary: "No action is needed.",
      reasons_json: JSON.stringify(["Records are complete."]),
      actionable: 0,
      notification_emitted: 0,
      context_json: JSON.stringify({
        diagnostics: {
          marketData: { ok: true },
        },
      }),
      created_at: "2026-01-01T03:30:00.000Z",
    },
    {
      id: 3,
      user_id: 42,
      asset: "BTC",
      symbol: "KRW-BTC",
      decision_status: "ACTION_NEEDED",
      summary: "Manual setup is incomplete.",
      reasons_json: JSON.stringify(["Missing cash record."]),
      actionable: 1,
      notification_emitted: 1,
      context_json: JSON.stringify({
        diagnostics: {
          marketData: { ok: false, reason: "FETCH_FAILURE" },
        },
      }),
      created_at: "2026-01-01T04:00:00.000Z",
    },
  ],
  [
    {
      id: 7,
      user_id: 42,
      decision_log_id: 3,
      asset: "BTC",
      reason_key: "setup:cash",
      delivery_status: "SKIPPED",
      event_type: "ACTION_NEEDED",
      channel: "telegram",
      payload_json: JSON.stringify({ message: "Manual setup is incomplete." }),
      sent_at: null,
      cooldown_until: "2026-01-01T06:00:00.000Z",
      suppressed_by: "cooldown",
      created_at: "2026-01-01T04:05:00.000Z",
    },
    {
      id: 8,
      user_id: 42,
      decision_log_id: null,
      asset: "BTC",
      reason_key: "setup:cash",
      delivery_status: "SENT",
      event_type: "ACTION_NEEDED",
      channel: "telegram",
      payload_json: JSON.stringify({ message: "Manual setup is incomplete." }),
      sent_at: "2026-01-01T03:10:00.000Z",
      cooldown_until: "2026-01-01T06:00:00.000Z",
      suppressed_by: null,
      created_at: "2026-01-01T03:10:00.000Z",
    },
  ],
);

const latestDecision = await getLatestDecisionLogInspection(db, 42);
assertEqual(
  latestDecision?.summary ?? null,
  "No action is needed.",
  "Latest decision inspection should return the most recent summary.",
);

const latestNotification = await getLatestNotificationEventInspection(db, 42);
assertEqual(
  latestNotification?.reasonKey ?? null,
  "setup:cash",
  "Latest notification inspection should return the most recent notification event.",
);
assertEqual(
  latestNotification?.createdAt ?? null,
  "2026-01-01T04:05:00.000Z",
  "Latest notification inspection should preserve the most recent event timestamp.",
);

const recentDecisionInspections = await listRecentDecisionLogInspections(db, 42, 2);
assertEqual(
  recentDecisionInspections.length,
  2,
  "Recent decision inspections should honor the requested limit.",
);
assertEqual(
  recentDecisionInspections[0]?.summary ?? null,
  "Manual setup is incomplete.",
  "Recent decision inspections should return newest rows first.",
);
assertEqual(
  recentDecisionInspections[1]?.summary ?? null,
  "No action is needed.",
  "Recent decision inspections should preserve descending order.",
);

const recentNotificationInspections = await listRecentNotificationEventInspections(
  db,
  42,
  2,
);
assertEqual(
  recentNotificationInspections.length,
  2,
  "Recent notification inspections should honor the requested limit.",
);
assertEqual(
  recentNotificationInspections[0]?.createdAt ?? null,
  "2026-01-01T04:05:00.000Z",
  "Recent notification inspections should return newest rows first.",
);

const hourlyHealth = await getHourlyHealthInspection(db, 42, 2);
assertEqual(
  hourlyHealth.userId,
  42,
  "Hourly health inspection should preserve the user id.",
);
assertEqual(
  hourlyHealth.decisionCount,
  2,
  "Hourly health inspection should count recent decisions within the requested window.",
);
assertEqual(
  hourlyHealth.notificationCount,
  2,
  "Hourly health inspection should count recent notifications within the requested window.",
);
assertEqual(
  hourlyHealth.latestDecisionLog?.summary ?? null,
  "No action is needed.",
  "Hourly health inspection should surface the latest decision log.",
);
assertEqual(
  hourlyHealth.latestNotificationEvent?.suppressedBy ?? null,
  "cooldown",
  "Hourly health inspection should surface the latest notification state.",
);

const builtHourlyHealth = buildHourlyHealthInspection({
  userId: 42,
  recentDecisionLogs: recentDecisionInspections,
  recentNotificationEvents: recentNotificationInspections,
  generatedAt: "2026-01-01T05:00:00.000Z",
});

assertEqual(
  builtHourlyHealth.generatedAt,
  "2026-01-01T05:00:00.000Z",
  "Explicit generated-at timestamps should be preserved for debug views.",
);
assert(
  builtHourlyHealth.latestDecisionLog !== null,
  "Hourly health inspection should preserve the latest decision log fallback.",
);

function createMockDb(
  decisionRows: Array<Record<string, unknown>>,
  notificationRows: Array<Record<string, unknown>>,
): D1DatabaseLike {
  return {
    prepare(query: string): D1PreparedStatement {
      return new MockStatement(query, decisionRows, notificationRows);
    },
    batch: async () => [],
    exec: async () => ({}),
  };
}

class MockStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly decisionRows: Array<Record<string, unknown>>,
    private readonly notificationRows: Array<Record<string, unknown>>,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>(_column?: string): Promise<T | null> {
    const results = this.selectRows();
    return (results[0] ?? null) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: this.selectRows() as T[] };
  }

  async run(): Promise<{ success: boolean; meta?: unknown }> {
    return { success: true };
  }

  private selectRows(): Record<string, unknown>[] {
    const userId = this.values[0] as number | undefined;
    const limit = this.values[1] as number | undefined;

    if (this.query.includes("FROM decision_logs")) {
      return [...this.decisionRows]
        .filter((row) => row.user_id === userId)
        .sort((left, right) => {
          const rightCreatedAt = Date.parse(String(right.created_at ?? ""));
          const leftCreatedAt = Date.parse(String(left.created_at ?? ""));
          return rightCreatedAt - leftCreatedAt;
        })
        .slice(0, typeof limit === "number" ? limit : 25);
    }

    if (this.query.includes("FROM notification_events")) {
      return [...this.notificationRows]
        .filter((row) => row.user_id === userId)
        .sort((left, right) => {
          const rightCreatedAt = Date.parse(String(right.created_at ?? ""));
          const leftCreatedAt = Date.parse(String(left.created_at ?? ""));
          return rightCreatedAt - leftCreatedAt;
        })
        .slice(0, typeof limit === "number" ? limit : 25);
    }

    return [];
  }
}
