const args = process.argv.slice(2);

const urlArg = readFlag(args, "--url");
const secretArg = readFlag(args, "--secret");
const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret =
  secretArg ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? null;

if (!token || token.trim().length === 0) {
  fail("TELEGRAM_BOT_TOKEN is required.");
}

if (!urlArg || urlArg.trim().length === 0) {
  fail("Usage: npm run telegram:webhook:set -- --url https://<worker>/telegram/webhook");
}

if (!webhookSecret || webhookSecret.trim().length === 0) {
  fail("TELEGRAM_WEBHOOK_SECRET is required. Pass --secret or set the environment variable.");
}

let webhookUrl;
try {
  webhookUrl = new URL(urlArg);
} catch {
  fail("The webhook URL must be a valid absolute URL.");
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
  },
  body: JSON.stringify({
    url: webhookUrl.toString(),
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
  }),
});

const payload = await safeJson(response);

if (!response.ok) {
  const description =
    payload && typeof payload.description === "string"
      ? payload.description
      : `HTTP ${response.status}`;
  fail(`Telegram setWebhook failed: ${description}`);
}

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

function readFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
