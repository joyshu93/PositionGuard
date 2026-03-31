# PositionGuard

PositionGuard is a Telegram-based BTC/ETH spot position coach bot. It is designed to help a user track manually reported cash and position state, combine that with public Upbit quotation data, and produce conservative rule-based coaching outputs.

This repository is intentionally in an MVP scaffold stage. The current goal is to build the safe, replaceable foundation for a future position coach, not the final strategy.

## What This Project Is

- A Telegram webhook bot for BTC and ETH spot investors
- A Cloudflare Workers + D1 modular monolith scaffold
- A public Upbit market-data consumer
- A stateful decision-context builder and conservative rule-based coaching engine

## What This Project Is Not

- An auto-trading bot
- An order execution system
- A private exchange account sync tool
- A place to store exchange API keys
- A live balance mirror
- A final discretionary decision engine
- A system that uses LLM judgment for trade calls in this stage

## Architecture

- `src/index.ts` hosts the Worker entrypoint, webhook wiring, and scheduled trigger integration.
- `src/upbit.ts` contains public Upbit quotation and candle normalization.
- `src/telegram.ts` owns Telegram webhook parsing and routing.
- `src/db/*` owns D1 persistence and operator-visibility queries.
- `src/decision/*` owns decision contracts, readiness-aware context assembly, market-structure summarization, and the conservative MVP coaching engine.
- `migrations/` holds D1 schema migrations.

The design is modular monolith by intent: adapters are isolated, domain types stay pure, and the future decision engine can be swapped in without rewiring the whole project.

## Supported Markets And Timeframes

- Markets: `KRW-BTC`, `KRW-ETH`
- Timeframes: `1h`, `4h`, `1d`
- Market data source: public Upbit quotation API only

## Local Setup

1. Install dependencies with `npm install`.
2. Create a D1 database and update the `database_id` in `wrangler.toml`.
3. Apply the D1 migrations locally.
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
- `npm run check`
- `npm run dev`
- `npm run deploy:dry-run`
- `npm run cf:d1:local`
- `npm run cf:d1:remote`
- `npm run cf:deploy`

## D1 Migrations

Apply migrations with Wrangler before running the bot:

```bash
wrangler d1 migrations apply position-guard --local
```

For remote databases:

```bash
wrangler d1 migrations apply position-guard --remote
```

Wrangler applies the numbered migration files in order, so fresh deploys should always use the full migration history under `migrations/`.

The migration history now covers:

- `users`
- `account_state`
- `position_state`
- `decision_logs`
- `notification_events`
- schema guards for non-negative cash and position values
- tracked-asset preference persistence for `BTC`, `ETH`, or both

## Deployment

This repository is set up for Cloudflare Workers with a D1 binding named `DB`.

Before deploying, make sure `wrangler.toml` has your real `database_id` and that the required secrets are available to the Worker:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- optional `UPBIT_BASE_URL`

Recommended deployment checklist:

1. Run local validation.
2. Apply the full D1 migration history locally if you want a local smoke path.
3. Create or verify the remote D1 database and replace `database_id` in `wrangler.toml`.
4. Set Worker secrets in Cloudflare.
5. Apply the remote D1 migrations.
6. Deploy the Worker.
7. Register the Telegram webhook.
8. Run the post-deploy smoke checks below.

Copy-pasteable deployment commands:

```powershell
npm run check
npm run cf:d1:local
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Optional only if you need a non-default public quotation endpoint:
# wrangler secret put UPBIT_BASE_URL
npm run cf:d1:remote
npm run cf:deploy
```

If you prefer the direct Wrangler commands instead of the package aliases:

```powershell
wrangler d1 migrations apply position-guard --remote
wrangler deploy
```

After deployment, register the Telegram webhook to the Worker endpoint:

```powershell
curl.exe "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" `
  -H "Content-Type: application/json" `
  -d "{\"url\":\"https://<your-worker-domain>/telegram/webhook\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\"}"
```

Or use the helper script after exporting the token and secret:

```powershell
$env:TELEGRAM_BOT_TOKEN = "<your-bot-token>"
$env:TELEGRAM_WEBHOOK_SECRET = "<your-webhook-secret>"
npm run telegram:webhook:set -- --url https://<your-worker-domain>/telegram/webhook
```

## Webhook Setup

The Telegram bot should receive updates via webhook. The Worker exposes `POST /telegram/webhook` and validates `x-telegram-bot-api-secret-token` against `TELEGRAM_WEBHOOK_SECRET`.

Set the Telegram webhook URL to your Worker endpoint and include the same secret configured in `TELEGRAM_WEBHOOK_SECRET`.

Default routes:

- `GET /`
- `GET /health`
- `POST /telegram/webhook`

## Smoke Test

Use these commands to verify the deployed Worker without claiming any remote success ahead of time:

```powershell
curl.exe https://<your-worker-domain>/
curl.exe https://<your-worker-domain>/health
curl.exe -i -X POST "https://<your-worker-domain>/telegram/webhook" `
  -H "Content-Type: application/json" `
  -H "x-telegram-bot-api-secret-token: wrong-secret" `
  -d "{}"
curl.exe -i -X POST "https://<your-worker-domain>/telegram/webhook" `
  -H "Content-Type: application/json" `
  -H "x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>" `
  -d "{\"update_id\":1,\"message\":{\"message_id\":1,\"date\":1,\"chat\":{\"id\":123456789,\"type\":\"private\"},\"from\":{\"id\":123456789,\"first_name\":\"Smoke\"},\"text\":\"/start\"}}"
curl.exe "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Expected results:

- `GET /` returns a small JSON service banner
- `GET /health` returns `200` with `status: healthy` when deployment config is complete, or `500` with explicit config errors when it is not
- `POST /telegram/webhook` with the wrong secret returns `403 Forbidden`
- `POST /telegram/webhook` with a valid secret returns `200 OK`
- `getWebhookInfo` shows the Worker URL and the configured secret token state

Safe Telegram command smoke path after webhook registration:

1. Send `/start`
2. Send `/track BTC` or `/track BOTH`
3. Send `/setcash 1000000`
4. Send `/setposition BTC 0 0` or another manual spot record
5. Send `/status`
6. Send `/lastdecision`
7. Send `/hourlyhealth`

All of these remain record-only. No order execution, private exchange access, or live balance sync is involved.

## Cron Setup

The hourly decision cycle is intended to run from a Cloudflare scheduled trigger. It should:

- load user-reported state
- fetch public market data
- assemble decision context
- run the conservative rule-based decision engine
- persist a decision log
- evaluate the temporary `ACTION_NEEDED` policy
- record sent or skipped notification events when that policy applies

The current stage should remain conservative and avoid noisy alerts.

For deploy-time debugging:

- `/health` reports missing `DB`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and invalid `UPBIT_BASE_URL` configuration clearly
- webhook requests with the wrong secret return `403`
- Telegram dispatch failures are logged server-side but acknowledged with `200 OK` to avoid retry storms from Telegram

## Temporary Alert Policy

The repository now implements a temporary alert contract for explicit `ACTION_NEEDED` cases. That policy is intentionally narrow and should stay conservative:

- alert only when the user needs a clear manual correction or setup completion
- alert for repeated public market snapshot failures only after several consecutive hourly failures for an existing recorded position
- alert when recorded spot structure weakens enough that invalidation, cash risk, and recorded position size need review
- suppress repeated alerts for the same reason within a cooldown window
- respect sleep mode strictly
- prefer silence over low-confidence or noisy notifications
- keep alert text short and record-oriented, and never imply trade execution

Current operator visibility surface:

- `/lastalert` shows the most recent sent `ACTION_NEEDED` alert snapshot for the current user
- `/status` includes tracked assets, sleep mode, setup readiness, missing next steps, and recent alert summaries when available
- `/lastdecision` shows the latest tracked-asset decision line per tracked asset, including verdict, summary, time, and alert outcome
- `/hourlyhealth` shows a compact recent hourly health summary including the latest verdict, market-data failures, and suppression counts

This is still not a final decision engine, and it is not an execution path.

The default schedule in `wrangler.toml` is hourly:

```toml
[triggers]
crons = ["0 * * * *"]
```

## Commands

Supported bot commands:

- `/start`
- `/help`
- `/status`
- `/track`
- `/setcash`
- `/setposition`
- `/lastdecision`
- `/hourlyhealth`
- `/lastalert`
- `/sleep on`
- `/sleep off`

Current behavior:

- `/start` explains the product boundary
- `/help` shows supported commands
- `/track <BTC|ETH|BOTH>` records which spot assets the user wants PositionGuard to track
- inline callback buttons let the user choose tracked assets, inspect setup progress, record cash, open BTC/ETH spot-record shortcuts, refresh `/status`, and open `/lastdecision` and `/hourlyhealth`
- `/status` reads stored user-reported state
- `/status` marks readiness complete only when cash plus the selected tracked asset records are present
- `/setcash <amount>` records available cash only
- `/setposition <BTC|ETH> <quantity> <average-entry-price>` records BTC/ETH spot state only
- `/lastdecision` inspects the latest tracked-asset hourly decision lines, including verdict, summary, time, and alert outcome
- `/hourlyhealth` inspects recent hourly processing health such as market-data failures, cooldown skips, sleep suppressions, and setup blocks
- `/sleep on` and `/sleep off` toggle alert quiet mode
- `/lastalert` inspects the most recent sent `ACTION_NEEDED` alert snapshot and its cooldown window

Any future buy/sell-related command must be record-only and must not execute trades.

## Readiness Model

Setup readiness is now based on the user's chosen tracked assets instead of always requiring both BTC and ETH:

- tracked assets may be `BTC`, `ETH`, or both
- existing users fall back conservatively to tracking both assets until they choose otherwise
- readiness requires a cash record plus position records for the chosen tracked assets only
- a tracked position record may be an empty spot record with quantity `0` and average entry `0`
- `/status`, inline onboarding progress, and setup-related `ACTION_NEEDED` alerts all use the same tracked-asset readiness logic

This remains a manual record system. It does not sync balances or execute orders.

## Current Limitations

- No auto-trading
- No authenticated exchange API usage
- No exchange key storage
- No live account sync
- No final discretionary decision engine
- No LLM-based judgment in this stage
- No support for markets beyond BTC and ETH spot
- No broad notification engine; only the temporary `ACTION_NEEDED` contract is implemented for narrow alerting and cooldown-based suppression
- Onboarding is intentionally lightweight; inline buttons guide setup, but cash and position values are still entered with commands
- `/lastalert`, `/lastdecision`, and `/hourlyhealth` are user-scoped inspection tools, not a global admin console

Decision outputs are structured as coaching summaries and reasons, and the current engine stays conservative and record-only. It summarizes simple 1h / 4h / 1d trend direction, recent range location, recorded average-entry profit/loss direction, and explicit invalidation-risk checks. It still prefers `SETUP_INCOMPLETE` / `INSUFFICIENT_DATA` / `NO_ACTION` when information is missing or structure is quiet, and keeps `ACTION_NEEDED` narrow for explicit manual correction, repeated market-data failure, or urgent risk/invalidation review.

## Roadmap

1. Add optional richer onboarding shortcuts beyond the current lightweight inline guidance.
2. Refine cooldown windows and notification inspection now that `ACTION_NEEDED` delivery exists.
3. Refine the current rule-based coaching thresholds without drifting into opaque scoring or noisy TA sprawl.
4. Expose deeper decision-log filtering if operator visibility needs to grow later.
5. Keep `ACTION_NEEDED` narrow, conservative, and non-execution oriented as the engine matures.

## Notes On Market Data

The Upbit client normalizes public quotation responses into internal types and supports candle retrieval for:

- 1 hour via `minutes/60`
- 4 hours via `minutes/240`
- daily via `days`

The current MVP engine uses those candles for simple, inspectable structure analysis only:

- trend direction on `1h`, `4h`, and `1d`
- recent high/low range context
- current price location inside the recent range
- recorded average-entry profit/loss direction
- explicit invalidation/risk-review checks for existing spot positions
