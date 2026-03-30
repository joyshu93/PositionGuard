# PositionGuard

PositionGuard is a Telegram-based BTC/ETH spot position coach bot. It is designed to help a user track manually reported cash and position state, combine that with public Upbit quotation data, and prepare structured decision context for future coaching logic.

This repository is intentionally in an MVP scaffold stage. The current goal is to build the safe, replaceable foundation for a future position coach, not the final strategy.

## What This Project Is

- A Telegram webhook bot for BTC and ETH spot investors
- A Cloudflare Workers + D1 modular monolith scaffold
- A public Upbit market-data consumer
- A stateful decision-context builder for future coaching logic

## What This Project Is Not

- An auto-trading bot
- An order execution system
- A private exchange account sync tool
- A place to store exchange API keys
- A live balance mirror
- A final discretionary decision engine
- A system that uses LLM judgment for trade calls in this stage

## Architecture

- `src/index.ts` is intended to host the Worker entrypoint.
- `src/upbit.ts` contains public Upbit quotation and candle normalization.
- `src/telegram.ts` is intended to own Telegram webhook parsing and routing.
- `src/db/*` is intended to own D1 persistence.
- `src/decision/*` is intended to own decision contracts and the stub engine.
- `migrations/` holds D1 schema migrations.

The design is modular monolith by intent: adapters are isolated, domain types stay pure, and the future decision engine can be swapped in without rewiring the whole project.

## Supported Markets And Timeframes

- Markets: `KRW-BTC`, `KRW-ETH`
- Timeframes: `1h`, `4h`, `1d`
- Market data source: public Upbit quotation API only

## Local Setup

1. Install dependencies with `npm install`.
2. Create a D1 database and update the `database_id` in `wrangler.toml`.
3. Apply the initial migration locally.
4. Configure Telegram and Cloudflare secrets.
5. Run the Worker locally with Wrangler.

Expected environment variables:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `UPBIT_BASE_URL` if you want to override the default

Useful commands:

- `npm run typecheck`
- `npm run build`
- `npm run test`
- `npm run dev`

## D1 Migrations

Apply migrations with Wrangler before running the bot:

```bash
wrangler d1 migrations apply position-guard --local
```

For remote databases:

```bash
wrangler d1 migrations apply position-guard --remote
```

The initial migration creates:

- `users`
- `account_state`
- `position_state`
- `decision_logs`
- `notification_events`

## Webhook Setup

The Telegram bot should receive updates via webhook. The Worker is expected to expose a Telegram webhook endpoint and validate the incoming secret before routing commands.

Set the Telegram webhook URL to your Worker endpoint and include the secret configured in `TELEGRAM_WEBHOOK_SECRET`.

Default routes:

- `GET /`
- `GET /health`
- `POST /telegram/webhook`

Example webhook registration:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://<your-worker-domain>/telegram/webhook\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\"}"
```

## Cron Setup

The hourly decision scaffold is intended to run from a Cloudflare scheduled trigger. It should:

- load user-reported state
- fetch public market data
- assemble decision context
- run the stub decision engine
- persist a decision log

The current stage should remain conservative and avoid noisy alerts.

The default schedule in `wrangler.toml` is hourly:

```toml
[triggers]
crons = ["0 * * * *"]
```

## Commands

Planned bot commands:

- `/start`
- `/help`
- `/status`
- `/setcash`
- `/sleep on`
- `/sleep off`

Current behavior:

- `/start` explains the product boundary
- `/help` shows supported commands
- `/status` reads stored user-reported state
- `/setcash <amount>` records available cash only
- `/sleep on` and `/sleep off` toggle alert quiet mode

Any future buy/sell-related command must be record-only and must not execute trades.

## Current Limitations

- No auto-trading
- No authenticated exchange API usage
- No exchange key storage
- No live account sync
- No final decision engine yet
- No LLM-based judgment in this stage
- No support for markets beyond BTC and ETH spot
- No Telegram command yet for entering BTC/ETH quantity and average entry price, although the DB schema is ready for it

## Roadmap

1. Add Telegram commands for manually recording BTC and ETH position quantity plus average entry price.
2. Expand `/status` with cleaner onboarding guidance and asset-specific setup completeness.
3. Add notification throttling and duplicate-suppression rules to `notification_events`.
4. Add richer public market structure summaries for `1h`, `4h`, and `1d`.
5. Replace the stub decision engine with a real scenario-based engine later.

## Notes On Market Data

The Upbit client normalizes public quotation responses into internal types and supports candle retrieval for:

- 1 hour via `minutes/60`
- 4 hours via `minutes/240`
- daily via `days`

This keeps the data layer simple now and leaves room for richer structural analysis later.
