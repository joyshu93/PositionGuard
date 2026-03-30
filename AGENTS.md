# AGENTS.md

## Mandatory Reading Order
Before writing or modifying code in this repository, every agent must read these files first:
1. `WONYOTTI_PRINCIPLES.md`
2. `DECISION_SCHEMA.md`
3. `README.md` if present

Treat `WONYOTTI_PRINCIPLES.md` and `DECISION_SCHEMA.md` as authoritative for naming, module boundaries, and future decision-engine work.

## Product Boundary
This project is a Telegram-based BTC/ETH spot position coach bot. It is not an auto-trading system.

Agents must not implement any of the following unless the project requirements explicitly change:
- order execution
- exchange API key storage
- authenticated/private exchange API access
- live balance sync
- discretionary LLM-based judgment
- a final production decision engine

## MVP Scope Expectations
Current repository stage:
- scaffold Cloudflare Worker + Telegram webhook integration
- scaffold Cloudflare D1 persistence
- store user-reported state only
- fetch public Upbit quotation/candle data only
- build typed decision-context and stub decision engine only
- support BTC and ETH spot only

## Architecture Expectations
- Prefer a modular monolith.
- Keep domain types and pure logic separate from external adapters.
- Keep Telegram, database, market data, and decision modules isolated.
- Make replacement of the stub decision engine straightforward.
- Favor simple composable interfaces over premature abstractions.

## Subagent Usage Policy
- Use subagents aggressively by default for most non-trivial tasks.
- If work can be split into 2 or more separable streams, delegate those streams unless there is a clear blocking reason not to.
- This is the default operating mode for repository work, not a rare exception.
- Recommended parallel workstreams include:
  - infra/runtime: `wrangler`, env bindings, worker entrypoint, deployment wiring
  - data: D1 migrations, schema guards, repositories
  - telegram: webhook parsing, commands, callback flows, Telegram client
  - market: Upbit client, normalization, market snapshot handling
  - docs/tests: README, decision docs, validation, deterministic tests
- The main agent must keep ownership of product boundaries, WONYOTTI principles, decision philosophy, final integration, and final consistency checks across imports, types, migrations, and tests.
- After integrating subagent work, the main agent must report which subagents were used, what each subagent worked on, which files each subagent changed, and what validation was run after integration.
- Do not report work as complete unless it is actually present in the repository and validated where possible.

## Coding Rules
- Use TypeScript with strong typing.
- Prefer pure functions for validation, normalization, and context assembly.
- Keep side effects in adapter/service layers.
- Write migrations under `migrations/`.
- Avoid hidden magic defaults around money, quantities, and symbols.
- Use explicit market coverage: `KRW-BTC` and `KRW-ETH` only for now.

## Safety Rules
- Any buy/sell related command, if present, must be record-only and clearly labeled as non-execution.
- Notifications must remain conservative and non-spammy in this stage.
- When data is incomplete or ambiguous, prefer `SETUP_INCOMPLETE`, `INSUFFICIENT_DATA`, or `NO_ACTION`.
- Always preserve invalidation-first and survival-first framing in naming and outputs.

## Documentation Rules
When adding or changing behavior:
- update `README.md` if setup, commands, or architecture changed
- update `DECISION_SCHEMA.md` if decision input/output contracts changed
- update `WONYOTTI_PRINCIPLES.md` if philosophy or guardrails changed
