// @ts-ignore test-only Node builtin import without @types/node
import { readFileSync } from "node:fs";
import { inferLocaleFromTelegramLanguageCode, resolveUserLocale } from "../src/i18n/index.js";
import { assert, assertEqual } from "./test-helpers.js";

assertEqual(
  inferLocaleFromTelegramLanguageCode("ko-KR"),
  "ko",
  "Telegram Korean language codes should map to ko.",
);

assertEqual(
  inferLocaleFromTelegramLanguageCode("en-US"),
  "en",
  "Non-Korean language codes should fall back to en.",
);

assertEqual(
  resolveUserLocale("en", "ko-KR"),
  "en",
  "Explicit saved locale should override Telegram language fallback.",
);

assertEqual(
  resolveUserLocale(null, "ko"),
  "ko",
  "Missing saved locale should use Telegram Korean fallback.",
);

assertEqual(
  resolveUserLocale(null, null),
  "en",
  "Missing saved locale and Telegram language should fall back to English.",
);

for (const path of [
  "src/i18n/messages.ts",
  "src/i18n/index.ts",
  "src/telegram/commands.ts",
  "src/status.ts",
  "src/operator-visibility.ts",
]) {
  const content = readFileSync(path, "utf8");
  assert(
    !content.includes("\uFFFD") && !content.includes("�"),
    `Edited localization surface should not contain mojibake replacement characters: ${path}`,
  );
}
