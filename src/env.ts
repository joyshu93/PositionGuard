export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBHOOK_PATH?: string;
  HEALTH_PATH?: string;
  UPBIT_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_VISION_MODEL?: string;
}

export const DEFAULT_HEALTH_PATH = "/health";
export const DEFAULT_TELEGRAM_WEBHOOK_PATH = "/telegram/webhook";

export interface RuntimeConfig {
  db: D1Database;
  telegramBotToken: string;
  telegramWebhookSecret: string | null;
  telegramWebhookPath: string;
  healthPath: string;
  upbitBaseUrl: string | null;
}

export function createRuntimeConfig(env: Env): RuntimeConfig {
  const errors: string[] = [];

  if (!env.DB || typeof env.DB.prepare !== "function") {
    errors.push("DB binding is missing or invalid");
  }

  const telegramBotToken = normalizeRequiredText(
    env.TELEGRAM_BOT_TOKEN,
    "TELEGRAM_BOT_TOKEN",
    errors,
  );
  const telegramWebhookSecret = normalizeOptionalText(env.TELEGRAM_WEBHOOK_SECRET);
  const telegramWebhookPath = normalizePath(
    env.TELEGRAM_WEBHOOK_PATH,
    DEFAULT_TELEGRAM_WEBHOOK_PATH,
    "TELEGRAM_WEBHOOK_PATH",
  );
  const healthPath = normalizePath(
    env.HEALTH_PATH,
    DEFAULT_HEALTH_PATH,
    "HEALTH_PATH",
  );
  const upbitBaseUrl = normalizeOptionalUrl(env.UPBIT_BASE_URL, errors);

  if (errors.length > 0) {
    throw new Error(
      `PositionGuard runtime configuration invalid: ${errors.join("; ")}`,
    );
  }

  return {
    db: env.DB,
    telegramBotToken,
    telegramWebhookSecret,
    telegramWebhookPath,
    healthPath,
    upbitBaseUrl,
  };
}

function normalizeRequiredText(
  value: string | undefined,
  name: string,
  errors: string[],
): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    errors.push(`${name} is required`);
    return "";
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizePath(
  value: string | undefined,
  fallback: string,
  name: string,
): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return fallback;
  }

  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }

  return normalized;
}

function normalizeOptionalUrl(
  value: string | undefined,
  errors: string[],
): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.push("UPBIT_BASE_URL must use http or https");
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    errors.push("UPBIT_BASE_URL must be a valid absolute URL");
    return null;
  }
}

export type RuntimeValidationScope = "health" | "webhook" | "scheduled";

export interface RuntimeConfigReport {
  ok: boolean;
  errors: string[];
  healthPath: string;
  webhookPath: string;
  upbitBaseUrl: string | null;
}

export function getRuntimeConfigReport(
  env: Partial<Env>,
  scope: RuntimeValidationScope,
): RuntimeConfigReport {
  const healthPath = normalizeRoutePath(env.HEALTH_PATH, DEFAULT_HEALTH_PATH);
  const webhookPath = normalizeRoutePath(
    env.TELEGRAM_WEBHOOK_PATH,
    DEFAULT_TELEGRAM_WEBHOOK_PATH,
  );
  const errors: string[] = [];

  if (!hasD1Binding(env.DB)) {
    errors.push("D1 binding `DB` is missing or invalid.");
  }

  if (!isNonEmptyString(env.TELEGRAM_BOT_TOKEN)) {
    errors.push("TELEGRAM_BOT_TOKEN is required.");
  }

  if (scope === "webhook" && !isNonEmptyString(env.TELEGRAM_WEBHOOK_SECRET)) {
    errors.push("TELEGRAM_WEBHOOK_SECRET is required for webhook validation.");
  }

  if (
    env.UPBIT_BASE_URL !== undefined &&
    env.UPBIT_BASE_URL !== null &&
    env.UPBIT_BASE_URL.trim().length > 0 &&
    !isValidHttpUrl(env.UPBIT_BASE_URL)
  ) {
    errors.push("UPBIT_BASE_URL must be a valid http or https URL when provided.");
  }

  return {
    ok: errors.length === 0,
    errors,
    healthPath,
    webhookPath,
    upbitBaseUrl: normalizeOptionalString(env.UPBIT_BASE_URL),
  };
}

export function assertRuntimeConfig(
  env: Partial<Env>,
  scope: RuntimeValidationScope,
): RuntimeConfigReport {
  const report = getRuntimeConfigReport(env, scope);
  if (!report.ok) {
    throw new Error(
      `Runtime configuration is invalid for ${scope}: ${report.errors.join("; ")}`,
    );
  }

  return report;
}

function hasD1Binding(value: unknown): value is D1Database {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as D1Database).prepare === "function"
  );
}

function normalizeRoutePath(
  value: string | undefined,
  fallback: string,
): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return fallback;
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeOptionalString(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
