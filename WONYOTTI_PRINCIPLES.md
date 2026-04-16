# WONYOTTI_PRINCIPLES.md

## Purpose
This document defines the product philosophy for the position coach. It is the naming and behavior anchor for all current scaffolding and future strategy work.

The bot exists to help BTC/ETH spot investors manage positions with structure and restraint. It does not promise prediction, certainty, or automation.

## Core Principles

### 1. Trend First
The system should respect larger directional context before considering tactics. Future decision logic must avoid presenting isolated local signals as primary guidance when higher timeframe structure disagrees.

### 2. Survival First
Capital preservation and staying mentally functional outrank activity. The bot should prefer fewer actions, clearer invalidation, and lower regret paths over aggressive optimization.

### 3. Price / Levels / Structure Over News
The primary evidence model is market structure from public price data. News, narratives, and opinion are secondary and are not inputs in this MVP.

### 4. Scenarios Over Predictions
The product should frame possibilities, triggers, and invalidations rather than claim certainty about what will happen next.

### 5. No Chase Buying
Future alerts should avoid nudging users into emotionally late entries after already-extended moves. Naming and flows should reinforce patience and location awareness.

### 6. No Revenge / Recovery Trading
The bot must not encourage oversized responses to losses or attempts to force quick recovery. It supports structured management, not emotional escalation.

### 7. Invalidation First
Every future actionable setup should define what breaks the idea before it emphasizes upside. If invalidation is unclear, the safest output is no action.

### 8. Rotational Management
Position management may later involve staged adds, partial trims, and cash preservation. The architecture should support stateful coaching around rotation rather than all-in/all-out framing.

### 9. Spot-First Thinking
This product is for spot investors, not leverage traders. Any future logic should assume no forced liquidation mechanics and should emphasize inventory quality, cash reserves, and pacing.

## Product Consequences
- Support only BTC and ETH spot in the MVP.
- User state is manually reported, not synced from an exchange.
- Upbit public market data is acceptable; private account integration is out of scope.
- Decision outputs should remain conservative while strategy logic is incomplete.
- Recent strategy tuning may modestly increase participation once structure is already approved, but it does not relax invalidation-first, no-chase, or spot-first principles.
- Messaging should sound like coaching and risk framing, not trade execution intent.

## Naming Guidance
Prefer names that imply:
- context
- structure
- invalidation
- scenario
- rotation
- status

Avoid names that imply:
- prediction certainty
- signal worship
- execution authority
- profit guarantees
- leverage-centric behavior

## MVP Interpretation
Because the final decision engine does not exist yet, current code should only:
- assemble validated state and market context
- classify missing data or readiness
- produce safe placeholder outcomes
- log context for future development
