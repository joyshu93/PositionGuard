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
5. Run the conservative rule-based decision engine.
6. Apply the temporary `ACTION_NEEDED` policy for explicit operational cases only.
7. Evaluate notification delivery with cooldown, sleep-mode, and chat-id suppression.
8. Store a structured decision log with hourly diagnostics.
9. Store a notification event only when an `ACTION_NEEDED` evaluation produces a sent or recorded skipped outcome.

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

## Narrative Contract
Decision summaries and reasons should read like conservative coaching, not execution guidance.

- `summary` should give a short, explicit coaching takeaway.
- `reasons` should explain setup, missing data, structure, invalidation, or risk in plain language.
- `ACTION_NEEDED` should stay narrow and only cover manual correction, contradictory state, repeated operational failure, or clear invalidation/risk escalation.
- The rule-based engine may use `ACTION_NEEDED` directly for risk review when structure weakens materially, while the temporary alert policy remains available for setup and operational failures.
- The rule-based engine may also use `ACTION_NEEDED` for conservative `entry review` or `add-buy review` coaching when structure is constructive and the setup is not chasing price.
- `NO_ACTION` should remain explicit that no order was executed and no order is being placed.
- Direct phrases such as `entry review`, `add-buy review`, `reduce review`, or `exit plan review` are allowed only when they are explicitly framed as record-only coaching.

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

Operator visibility should stay read-only and concise:
- `/lastdecision` should summarize the latest decision status, summary, created time, and alert outcome
- `/hourlyhealth` should summarize the latest verdict, cooldown skips, sleep suppression, setup blocks, and repeated market-data failures
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

The current MVP engine may summarize:
- 1h / 4h / 1d trend direction
- recent range high/low context
- whether current price is pressing the lower, middle, or upper part of that range
- whether the recorded average entry is in profit or drawdown
- whether available cash exists for a first entry review or a staged add-buy review
- whether invalidation/risk review is becoming urgent for an existing spot position

The current MVP engine does not rely on external TA libraries. Its active rule inputs are:
- public ticker price
- 1h / 4h / 1d normalized candles
- simple trend direction derived from recent candle closes
- recent range location and support-break checks
- recorded cash, quantity, and average entry price

## Design Constraints
- Keep domain types explicit and serializable.
- Keep context assembly separate from engine evaluation.
- Make it possible to unit test the engine with pure fixtures.
- Do not hide important assumptions in adapters.
- Prefer additive schema evolution over frequent breaking renames.
