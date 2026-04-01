import type { SupportedLocale } from "../domain/types.js";
import { getMessages } from "./messages.js";

const SUPPORTED_LOCALES: SupportedLocale[] = ["ko", "en"];

export { getMessages };

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === "ko" || value === "en";
}

export function inferLocaleFromTelegramLanguageCode(
  languageCode: string | null | undefined,
): SupportedLocale {
  const normalized = languageCode?.trim().toLowerCase();
  if (normalized?.startsWith("ko")) {
    return "ko";
  }

  return "en";
}

export function resolveUserLocale(
  savedLocale: SupportedLocale | null | undefined,
  telegramLanguageCode?: string | null,
): SupportedLocale {
  if (savedLocale && isSupportedLocale(savedLocale)) {
    return savedLocale;
  }

  return inferLocaleFromTelegramLanguageCode(telegramLanguageCode);
}

export function formatNumberForLocale(locale: SupportedLocale, value: number, maximumFractionDigits = 8): string {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function formatCompactTimestampForLocale(locale: SupportedLocale, value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const formatter = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second} KST`;
}

export function localizeNoExecution(locale: SupportedLocale): string {
  return locale === "ko" ? "\uC8FC\uBB38\uC740 \uC2E4\uD589\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." : "No trade was executed.";
}

export function formatAvailability(locale: SupportedLocale, value: boolean): string {
  const messages = getMessages(locale);
  return value ? messages.booleans.yes : messages.booleans.no;
}

export function formatLocaleName(locale: SupportedLocale): string {
  return getMessages(locale).localeName;
}

export function listSupportedLocales(): SupportedLocale[] {
  return [...SUPPORTED_LOCALES];
}
