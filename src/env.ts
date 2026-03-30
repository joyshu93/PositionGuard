export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBHOOK_PATH?: string;
  HEALTH_PATH?: string;
  UPBIT_BASE_URL?: string;
}

export const DEFAULT_HEALTH_PATH = "/health";
export const DEFAULT_TELEGRAM_WEBHOOK_PATH = "/telegram/webhook";
