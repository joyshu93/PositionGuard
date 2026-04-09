import type {
  DecisionContext,
  DecisionDiagnostics,
  DecisionResult,
  DecisionTriggerState,
} from "../domain/types.js";
import { resolveUserLocale } from "../i18n/index.js";
import { buildStrategyDecision, type StrategyDecisionCore } from "./strategy-core.js";

export function runDecisionEngine(context: DecisionContext): DecisionResult {
  if (!context.setup.isReady) {
    return buildSetupIncompleteResult(context);
  }

  if (!context.marketSnapshot) {
    return buildInsufficientDataResult(context);
  }

  const strategyDecision = buildStrategyDecision(context);
  return mapStrategyDecision(context, strategyDecision);
}

function mapStrategyDecision(
  context: DecisionContext,
  strategy: StrategyDecisionCore,
): DecisionResult {
  const actionable =
    strategy.action !== "HOLD"
    && strategy.executionDisposition !== "DEFERRED_CONFIRMATION";
  const status: DecisionResult["status"] = actionable ? "ACTION_NEEDED" : "NO_ACTION";

  return {
    status,
    summary: strategy.summary,
    reasons: strategy.reasons,
    actionable,
    symbol: context.marketSnapshot?.market ?? null,
    generatedAt: context.generatedAt,
    alert: actionable
      ? {
          reason: strategy.alertReason ?? "ENTRY_REVIEW_REQUIRED",
          cooldownKey:
            strategy.cooldownKey
            ?? `decision:${context.user.id}:${context.marketSnapshot?.market ?? "market"}`,
          message: buildAlertMessage(context, strategy),
        }
      : null,
    executionGuide: actionable ? strategy.executionGuide : null,
    diagnostics: strategy.diagnostics,
  };
}

function buildSetupIncompleteResult(context: DecisionContext): DecisionResult {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const summary =
    locale === "ko"
      ? "\uC0AC\uC6A9\uC790 \uC785\uB825\uC774 \uC544\uC9C1 \uCDA9\uBD84\uD558\uC9C0 \uC54A\uC544 \uD310\uB2E8\uC744 \uBCF4\uB958\uD569\uB2C8\uB2E4."
      : "Manual setup is incomplete, so the bot is waiting for user-reported inputs.";

  return {
    status: "SETUP_INCOMPLETE",
    summary,
    reasons: [
      `Missing setup items: ${context.setup.missingItems.join(", ")}.`,
      "PositionGuard only works from user-reported state.",
    ],
    actionable: false,
    symbol: context.marketSnapshot?.market ?? null,
    generatedAt: context.generatedAt,
    alert: null,
    executionGuide: null,
    diagnostics: buildBoundaryDiagnostics(context, "SETUP_INCOMPLETE", "NONE", "NOT_APPLICABLE"),
  };
}

function buildInsufficientDataResult(context: DecisionContext): DecisionResult {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const summary =
    locale === "ko"
      ? "\uACF5\uAC1C \uC2DC\uC7A5 \uB370\uC774\uD130\uAC00 \uC5C6\uC5B4 \uC774\uBC88 \uD68C\uCC28 \uD310\uB2E8\uC744 \uAC74\uB108\uB701\uB2C8\uB2E4."
      : "Public market context is unavailable for this cycle.";

  return {
    status: "INSUFFICIENT_DATA",
    summary,
    reasons: [
      "The decision scaffold requires a normalized market snapshot.",
      "No fallback strategy logic is enabled in the MVP.",
    ],
    actionable: false,
    symbol: context.marketSnapshot?.market ?? null,
    generatedAt: context.generatedAt,
    alert: null,
    executionGuide: null,
    diagnostics: buildBoundaryDiagnostics(context, "INSUFFICIENT_DATA", "NONE", "NOT_APPLICABLE"),
  };
}

function buildAlertMessage(
  context: DecisionContext,
  strategy: StrategyDecisionCore,
): string {
  const locale = resolveUserLocale(context.user.locale ?? null);
  const guide = strategy.executionGuide;

  if (!guide) {
    return [strategy.summary, ...strategy.reasons.slice(0, 3)].join("\n");
  }

  const zone = formatGuideZone(guide.entryZoneLow, guide.entryZoneHigh, locale);
  const lines =
    locale === "ko"
      ? [
          strategy.summary,
          `\uD589\uB3D9 \uAD6C\uAC04: ${zone}`,
          guide.initialSizePctOfCash === null
            ? null
            : `\uCCAB \uBD84\uD560: ${formatPercent(guide.initialSizePctOfCash)}`,
          guide.maxTotalSizePctOfCash === null
            ? null
            : `\uCD5C\uB300 \uCD1D\uBE44\uC911: ${formatPercent(guide.maxTotalSizePctOfCash)}`,
          guide.reducePctOfPosition === null
            ? null
            : `\uCD95\uC18C \uBE44\uC911: ${formatPercent(guide.reducePctOfPosition)}`,
          `\uBB34\uD6A8\uD654: ${guide.invalidationRuleText}`,
          `\uCD94\uACA9 \uAE08\uC9C0: ${guide.chaseGuardText}`,
          guide.cautionText ? `\uC8FC\uC758: ${guide.cautionText}` : null,
        ]
      : [
          strategy.summary,
          `Action zone: ${zone}`,
          guide.initialSizePctOfCash === null
            ? null
            : `First staged size: ${formatPercent(guide.initialSizePctOfCash)}`,
          guide.maxTotalSizePctOfCash === null
            ? null
            : `Max total size: ${formatPercent(guide.maxTotalSizePctOfCash)}`,
          guide.reducePctOfPosition === null
            ? null
            : `Reduce amount: ${formatPercent(guide.reducePctOfPosition)}`,
          `Invalidation: ${guide.invalidationRuleText}`,
          `Chase guard: ${guide.chaseGuardText}`,
          guide.cautionText ? `Caution: ${guide.cautionText}` : null,
        ];

  return lines.filter((line): line is string => line !== null).join("\n");
}

function formatGuideZone(
  low: number | null,
  high: number | null,
  locale: "ko" | "en",
): string {
  if (low !== null && high !== null) {
    return `${formatMoney(low)}-${formatMoney(high)} KRW`;
  }
  if (low !== null) {
    return `>= ${formatMoney(low)} KRW`;
  }
  if (high !== null) {
    return `<= ${formatMoney(high)} KRW`;
  }
  return locale === "ko"
    ? "\uB354 \uBA85\uD655\uD55C \uAD6C\uAC04 \uD655\uC778 \uD6C4 \uB300\uAE30"
    : "wait for a clearer zone";
}

function formatPercent(value: number): string {
  return `${Math.max(0, value)}%`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.max(0, value),
  );
}

function buildBoundaryDiagnostics(
  context: DecisionContext,
  status: DecisionResult["status"],
  setupKind: DecisionDiagnostics["setup"]["kind"],
  triggerState: DecisionTriggerState,
): DecisionDiagnostics {
  return {
    regime: null,
    setup: {
      kind: setupKind,
      state: status === "SETUP_INCOMPLETE" ? "BLOCKED" : "NOT_APPLICABLE",
      supports: [],
      blockers: status === "SETUP_INCOMPLETE" ? context.setup.missingItems : [],
    },
    trigger: {
      state: triggerState,
      confirmed: [],
      missing: status === "INSUFFICIENT_DATA" ? ["Public market data is missing."] : [],
    },
    risk: {
      level: "LOW",
      invalidationState: "UNCLEAR",
      invalidationLevel: null,
      notes: [],
    },
    indicators: {
      price: null,
      timeframes: {
        "1h": emptyTimeframeSnapshot(),
        "4h": emptyTimeframeSnapshot(),
        "1d": emptyTimeframeSnapshot(),
      },
    },
    strategy: null,
  };
}

function emptyTimeframeSnapshot(): DecisionDiagnostics["indicators"]["timeframes"]["1h"] {
  return {
    trend: "FLAT",
    location: "MIDDLE",
    ema20: null,
    ema50: null,
    ema200: null,
    atr14: null,
    rsi14: null,
    macdHistogram: null,
    volumeRatio: null,
    support: null,
    resistance: null,
    swingLow: null,
    swingHigh: null,
  };
}
