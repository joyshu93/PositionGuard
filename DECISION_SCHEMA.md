# DECISION_SCHEMA.md

## Purpose
This document defines the shape of the future decision system so the MVP scaffold can be built without prematurely implementing real strategy logic.

## Current Stage
At this stage, the repository may implement:
- typed decision input and output contracts
- decision-context assembly
- placeholder readiness checks
- conservative rule-based coaching summaries and reasons
- simple market-structure summaries for `1h`, `4h`, and `1d`
- a temporary `ACTION_NEEDED` alert contract for explicit operational cases only
- persistence for decision logs

At this stage, the repository must not implement:
- final discretionary decision rules
- predictive scoring
- LLM judgment
- execution instructions tied to exchange APIs

## Decision Flow
1. Load user-reported account and position state.
2. Fetch public market context for supported assets.
3. Normalize data into internal domain types.
4. Assemble a decision context.
5. Classify the market regime from public ticker plus `1h` / `4h` / `1d` candles.
6. Evaluate whether an entry, add-buy, or reduce setup is allowed.
7. Evaluate lower-timeframe trigger confirmation.
8. Evaluate invalidation and risk.
9. Apply the temporary `ACTION_NEEDED` policy for explicit operational cases only.
10. Evaluate market-signal alert delivery with cooldown, sleep-mode, and chat-id suppression.
11. Evaluate a separate state-update reminder layer when the same signal repeats against unchanged manual state.
12. Store a structured decision log with hourly diagnostics.
13. Store notification events for both market-signal alerts and state-update reminders when they are sent or when an eligible reminder is explicitly suppressed.

## Decision Input Shape
The future decision engine should receive a context object with these categories:

### User Setup
- telegram user identity
- sleep mode preference
- tracked asset preference, limited to BTC, ETH, or both
- whether onboarding is complete
- setup readiness should remain explicit and user-reported, with account cash plus the selected tracked asset position records tracked separately

### Account State
- available cash
- reporting timestamp
- source marker: user_reported

### Position State
- asset: BTC or ETH
- holding quantity
- average entry price
- reporting timestamp
- whether position is effectively empty

### Market Context
- symbol: `KRW-BTC` or `KRW-ETH`
- latest trade price
- timeframe snapshots for `1h`, `4h`, `1d`
- normalized candles sufficient for future structure analysis
- fetch timestamp

### Active Rule Inputs
The current conservative engine actively uses:

- current price from the public ticker
- `1h` / `4h` / `1d` candle history
- EMA20 / EMA50 / EMA200
- ATR14
- recent swing high / swing low
- recent support / resistance
- range location inside the recent structure
- volume ratio on the latest candle versus recent average volume
- RSI14
- MACD `(12, 26, 9)` and histogram direction
- user-reported available cash
- user-reported quantity and average entry price

Indicators must remain inspectable and rule-based. They are confirmation inputs only, not a hidden scoring system.

## Decision Output Shape
The decision engine output should remain machine-friendly and easy to replace.

Required fields:
- `status`
- `summary`
- `reasons`
- `actionable`
- `symbol`
- `generatedAt`

Allowed MVP statuses:
- `SETUP_INCOMPLETE`
- `INSUFFICIENT_DATA`
- `NO_ACTION`
- `ACTION_NEEDED`

Future statuses may later include scenario or management categories, but they should not be added until real strategy logic exists.

## Diagnostics Shape
The current engine may attach structured diagnostics with these sections:

- `regime`
  - `classification`: `BULL_TREND` | `PULLBACK_IN_UPTREND` | `RANGE` | `WEAK_DOWNTREND` | `BREAKDOWN_RISK`
  - `summary`
- `setup`
  - `kind`: `ENTRY` | `ADD_BUY` | `REDUCE` | `NONE`
  - `state`: `READY` | `PROMISING` | `BLOCKED` | `NOT_APPLICABLE`
  - `supports`
  - `blockers`
- `trigger`
  - `state`: `CONFIRMED` | `PENDING` | `BEARISH_CONFIRMATION` | `NOT_APPLICABLE`
  - `confirmed`
  - `missing`
- `risk`
  - `level`: `LOW` | `MODERATE` | `ELEVATED` | `HIGH`
  - `invalidationState`: `CLEAR` | `UNCLEAR` | `BROKEN`
  - `invalidationLevel`
  - `notes`
- `indicators`
  - `price`
  - `timeframes["1h" | "4h" | "1d"]`
    - `trend`
    - `location`
    - `ema20`
    - `ema50`
    - `ema200`
    - `atr14`
    - `rsi14`
    - `macdHistogram`
    - `volumeRatio`
    - `support`
    - `resistance`
    - `swingLow`
    - `swingHigh`

## Narrative Contract
Decision summaries and reasons should read like conservative coaching, not execution guidance.

- `summary` should give a short, explicit coaching takeaway.
- `reasons` should explain regime, setup, trigger, invalidation, or risk in plain language.
- `ACTION_NEEDED` should stay narrow and only cover manual correction, contradictory state, repeated operational failure, or clear invalidation/risk escalation.
- The rule-based engine may use `ACTION_NEEDED` directly for risk review when structure weakens materially, while the temporary alert policy remains available for setup and operational failures.
- The rule-based engine may also use `ACTION_NEEDED` for conservative `entry review` or `add-buy review` coaching when structure is constructive and the setup is not chasing price.
- A separate state-update reminder may be delivered later when the same `entry review`, `add-buy review`, or `reduce review` signal repeats while the stored manual state still looks unchanged.
- `NO_ACTION` should remain explicit that no order was executed and no order is being placed.
- Direct phrases such as `entry review`, `add-buy review`, `reduce review`, `sell review`, `invalidation review`, or `exit plan review` are allowed only when they are explicitly framed as record-only coaching.

## Temporary Alert Policy
`ACTION_NEEDED` is intentionally narrow and temporary. It should only be used for explicit, inspectable cases such as:
- incomplete user setup that requires manual cash or tracked-asset position input
- repeated public market snapshot failure for an existing position after several consecutive hourly failures
- clearly contradictory stored state that the user must correct
- constructive no-position structure with available cash that justifies a conservative staged entry review
- constructive pullback structure for an existing spot position with available cash that justifies a staged add-buy review
- clear structure weakening that warrants invalidation, cash-risk, or recorded-size review

Notification behavior under this contract should remain conservative:
- prefer silence over repeated or low-confidence alerts
- suppress duplicate alerts for the same user, asset, and reason within a cooldown window
- respect sleep mode strictly
- keep message text short, concrete, and record-oriented
- expose recent alert state through lightweight debug inspection, such as `/lastalert`

## Reminder Layer
The reminder layer is separate from the market-signal alert layer.

- reminder targets are limited to `ENTRY_REVIEW_REQUIRED`, `ADD_BUY_REVIEW_REQUIRED`, and `REDUCE_REVIEW_REQUIRED`
- setup-incomplete and market-data-failure cycles are not reminder targets
- reminder eligibility requires repeated identical signal reason for the same asset plus unchanged stored manual state
- unchanged manual state is evaluated from user-reported cash, quantity, average entry price, and their reporting/update timestamps
- reminder delivery has its own cooldown and must still respect sleep mode and missing-chat-id suppression
- reminder text should focus on refreshing `/setposition` or `/setcash` if the user already acted outside the bot
- reminder text must remain non-execution framed and keep `No trade was executed.`

Operator visibility should stay read-only and concise:
- `/lastdecision` should summarize the latest decision status, summary, created time, alert outcome, regime, trigger state, and invalidation state
- `/hourlyhealth` should summarize the latest verdict, cooldown skips, sleep suppression, setup blocks, repeated market-data failures, and latest regime / trigger / invalidation state
- `/lastalert` should summarize the most recent sent `ACTION_NEEDED` alert snapshot and cooldown window
- none of these surfaces should imply trade execution or discretionary authority

Current MVP readiness semantics are:
- tracked assets default conservatively to BTC and ETH for users who have not chosen yet
- readiness requires a cash record plus position records for the chosen tracked assets only
- users are not required to configure both BTC and ETH if they only intend to track one

## Decision Log Expectations
Each decision log currently captures:
- user id
- asset / market
- output status and summary
- whether a notification was emitted
- timestamps
- serialized context that includes hourly diagnostics for:
  - readiness completeness and missing items
  - market-data availability and consecutive failure count
  - base decision status versus final decision status
  - notification eligibility, sent/skipped outcome, suppression reason, cooldown key, and cooldown window
  - reminder repeated-signal count, unchanged-state evaluation, eligibility, sent/skipped outcome, suppression reason, and cooldown window

The current MVP engine may summarize:
- market regime on `1h` / `4h` / `1d`
- setup readiness for `ENTRY`, `ADD_BUY`, or `REDUCE`
- trigger confirmation or absence
- recent range high/low context and current range location
- whether the recorded average entry is in profit or drawdown
- whether available cash exists for a first entry review or a staged add-buy review
- whether invalidation or risk review is becoming urgent for an existing spot position

## Allowed Coaching Phrases
Allowed coaching phrasing includes:

- `entry review`
- `add-buy review`
- `reduce review`
- `sell review`
- `exit plan review`
- `invalidation review`

These phrases must remain coaching-only. They must not imply order execution, broker connectivity, or any private exchange capability. `No trade was executed.` should remain present in user-facing alert text.

## Alert Contract
The current alert reasons should stay narrow and explicit:

- `COMPLETE_SETUP`
- `INVALID_RECORDED_STATE`
- `MARKET_DATA_UNAVAILABLE`
- `ENTRY_REVIEW_REQUIRED`
- `ADD_BUY_REVIEW_REQUIRED`
- `REDUCE_REVIEW_REQUIRED`
- `STATE_UPDATE_REMINDER`

Different delivery policies may later be applied per reason, but the contract should remain stable and conservative.

## Design Constraints
- Keep domain types explicit and serializable.
- Keep context assembly separate from engine evaluation.
- Make it possible to unit test the engine with pure fixtures.
- Do not hide important assumptions in adapters.
- Prefer additive schema evolution over frequent breaking renames.
