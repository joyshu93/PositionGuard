# DECISION_SCHEMA.md

## Purpose
This document defines the shape of the future decision system so the MVP scaffold can be built without prematurely implementing real strategy logic.

## Current Stage
At this stage, the repository may implement:
- typed decision input and output contracts
- decision-context assembly
- placeholder readiness checks
- conservative stub statuses
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
5. Run a stub decision engine.
6. Store a structured decision log.
7. Optionally produce conservative `ACTION_NEEDED` notifications for explicit operational cases, with throttling and sleep-mode suppression.

## Decision Input Shape
The future decision engine should receive a context object with these categories:

### User Setup
- telegram user identity
- sleep mode preference
- whether onboarding is complete
- setup completeness should remain explicit and user-reported, with account cash plus BTC/ETH position records tracked separately

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

## Temporary Alert Policy
`ACTION_NEEDED` is intentionally narrow and temporary. It should only be used for explicit, inspectable cases such as:
- incomplete user setup that requires manual cash or position input
- repeated public market snapshot failure for an existing position after several consecutive hourly failures
- clearly contradictory stored state that the user must correct

Notification behavior under this contract should remain conservative:
- prefer silence over repeated or low-confidence alerts
- suppress duplicate alerts for the same user, asset, and reason within a cooldown window
- respect sleep mode strictly
- keep message text short, concrete, and record-oriented
- expose recent alert state through lightweight debug inspection, such as `/lastalert`

## Decision Log Expectations
Each decision log should capture:
- user id
- asset / market
- input snapshot reference or serialized summary
- output status
- output summary
- whether a notification was emitted
- timestamps

## Design Constraints
- Keep domain types explicit and serializable.
- Keep context assembly separate from engine evaluation.
- Make it possible to unit test the engine with pure fixtures.
- Do not hide important assumptions in adapters.
- Prefer additive schema evolution over frequent breaking renames.
