import type { SupportedLocale } from "../domain/types.js";
import type { D1DatabaseLike } from "../db/db.js";
import {
  createPendingImageImport,
  getPendingImageImportById,
  listRecentPendingImageImportsForUser,
  markPendingImageImportAwaitingUpload,
  markPendingImageImportConfirmed,
  markPendingImageImportFailed,
  markPendingImageImportRejected,
  updatePendingImageImport,
} from "../db/pending-image-imports.js";
import {
  ensureTelegramUser,
  getUserByTelegramUserId,
  setCashByTelegramUserId,
  setPositionByTelegramUserId,
} from "../db/repositories.js";
import { nowIso } from "../db/db.js";
import type {
  ImageImportBeginResult,
  ImageImportConfirmResult,
  ImageImportExtractionResult,
  ImageImportMediaInput,
  ImageImportProcessingResult,
  ImageImportRejectResult,
  PortfolioSnapshotImportData,
  TelegramImageImportProvider,
} from "./types.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_VISION_MODEL = "gpt-4.1-mini";
const PENDING_IMPORT_TTL_MS = 30 * 60 * 1000;
const LOW_CONFIDENCE_THRESHOLD = 0.55;
const MAX_IMAGE_IMPORT_BYTES = 4 * 1024 * 1024;

interface ImageImportServiceOptions {
  db: D1DatabaseLike;
  telegramBotToken: string;
  openAiApiKey?: string | null;
  openAiVisionModel?: string | null;
}

export function createTelegramImageImportProvider(
  options: ImageImportServiceOptions,
): TelegramImageImportProvider {
  const model = normalizeOptionalText(options.openAiVisionModel) ?? DEFAULT_OPENAI_VISION_MODEL;
  const openAiApiKey = normalizeOptionalText(options.openAiApiKey);

  return {
    isConfigured() {
      return Boolean(openAiApiKey);
    },

    async beginImport(input) {
      if (!openAiApiKey) {
        return {
          kind: "UNAVAILABLE",
          messageKey: "not_configured",
        };
      }

      const user = await getOrCreateUser(options.db, input.telegramUserId);
      await expireRecentPendingImports(options.db, user.id);

      const createdAt = nowIso();
      const expiresAt = new Date(Date.parse(createdAt) + PENDING_IMPORT_TTL_MS).toISOString();
      const pending = await createPendingImageImport(options.db, {
        userId: user.id,
        status: "AWAITING_UPLOAD",
        importKind: "UNKNOWN",
        expiresAt,
        createdAt,
        updatedAt: createdAt,
      });

      return {
        kind: "READY",
        importId: pending.id,
        expiresAt: pending.expiresAt,
      };
    },

    async processMedia(input) {
      if (!openAiApiKey) {
        return {
          kind: "UNAVAILABLE",
          messageKey: "not_configured",
        };
      }

      const user = await ensureTelegramUser(options.db, {
        telegramUserId: String(input.telegramUserId),
        telegramChatId: String(input.telegramChatId),
        username: input.username ?? null,
        displayName: input.displayName ?? null,
        languageCode: input.languageCode ?? null,
        locale: input.preferredLocale ?? null,
      });

      const latestPending = await getLatestAwaitingImportId(options.db, user.id);
      await expireRecentPendingImports(options.db, user.id, latestPending?.id ?? null);
      const pending = latestPending
        ? await markPendingImageImportAwaitingUpload(options.db, latestPending.id, {
            expiresAt: createExpiryIso(),
          })
        : await createPendingImageImport(options.db, {
            userId: user.id,
            status: "AWAITING_UPLOAD",
            importKind: "UNKNOWN",
            expiresAt: createExpiryIso(),
          });

      try {
        const telegramFile = await downloadTelegramImage(
          options.telegramBotToken,
          input.telegramFileId,
          input.mimeType,
        );
        const extraction = await analyzeImageWithOpenAi({
          apiKey: openAiApiKey,
          model,
          mimeType: telegramFile.mimeType,
          dataUrl: telegramFile.dataUrl,
          locale: input.preferredLocale ?? null,
        });

        if (extraction.kind !== "PORTFOLIO_SNAPSHOT") {
          await updatePendingImageImport(options.db, {
            id: pending.id,
            status: "FAILED",
            importKind: extraction.kind,
            telegramFileId: input.telegramFileId,
            telegramMessageId: input.telegramMessageId ?? null,
            extractedPayload: extraction,
            confidence: clampConfidence(extraction.confidence),
            errorMessage: `unsupported_kind:${extraction.kind}`,
            failedAt: nowIso(),
          });

          return {
            kind: "UNSUPPORTED_KIND",
            detectedKind: extraction.kind,
            confidence: extraction.confidence,
            summary: extraction.summary,
            warnings: extraction.warnings,
          } satisfies ImageImportProcessingResult;
        }

        if (
          extraction.confidence < LOW_CONFIDENCE_THRESHOLD ||
          !hasAnyPortfolioValues(extraction.portfolio)
        ) {
          await updatePendingImageImport(options.db, {
            id: pending.id,
            status: "FAILED",
            importKind: extraction.kind,
            telegramFileId: input.telegramFileId,
            telegramMessageId: input.telegramMessageId ?? null,
            extractedPayload: extraction,
            confidence: clampConfidence(extraction.confidence),
            errorMessage: "low_confidence",
            failedAt: nowIso(),
          });

          return {
            kind: "LOW_CONFIDENCE",
            confidence: extraction.confidence,
            summary: extraction.summary,
            warnings: extraction.warnings,
          } satisfies ImageImportProcessingResult;
        }

        const expiresAt = createExpiryIso();
        const updated = await updatePendingImageImport(options.db, {
          id: pending.id,
          status: "PENDING_CONFIRMATION",
          importKind: extraction.kind,
          telegramFileId: input.telegramFileId,
          telegramMessageId: input.telegramMessageId ?? null,
          extractedPayload: extraction,
          confidence: clampConfidence(extraction.confidence),
          errorMessage: null,
          expiresAt,
        });

        return {
          kind: "PENDING_CONFIRMATION",
          importId: updated.id,
          confidence: extraction.confidence,
          summary: extraction.summary,
          warnings: extraction.warnings,
          portfolio: extraction.portfolio,
          expiresAt: updated.expiresAt,
        } satisfies ImageImportProcessingResult;
      } catch (error) {
        await markPendingImageImportFailed(options.db, pending.id, {
          errorMessage: error instanceof Error ? error.message : "image_import_failed",
        });

        return {
          kind: "FAILED",
          messageKey: error instanceof Error && error.message.includes("download")
            ? "download_failed"
            : "analysis_failed",
          detail: error instanceof Error ? error.message : null,
        } satisfies ImageImportProcessingResult;
      }
    },

    async confirmImport(input) {
      const user = await getUserByTelegramUserId(options.db, String(input.telegramUserId));
      if (!user) {
        return { kind: "NOT_FOUND" } satisfies ImageImportConfirmResult;
      }

      const pending = await getPendingImageImportById(options.db, input.importId);
      if (!pending || pending.userId !== user.id || pending.status !== "PENDING_CONFIRMATION") {
        return { kind: "NOT_FOUND" } satisfies ImageImportConfirmResult;
      }

      if (Date.parse(pending.expiresAt) <= Date.now()) {
        await markPendingImageImportRejected(options.db, pending.id, {
          errorMessage: "expired",
        });
        return { kind: "EXPIRED" } satisfies ImageImportConfirmResult;
      }

      const extraction = parseExtraction(pending.extractedPayload);
      if (!extraction || extraction.kind !== "PORTFOLIO_SNAPSHOT") {
        await markPendingImageImportFailed(options.db, pending.id, {
          errorMessage: "invalid_payload",
        });
        return { kind: "NOT_FOUND" } satisfies ImageImportConfirmResult;
      }

      const portfolio = sanitizePortfolio(extraction.portfolio);
      const applied = {
        cash: false,
        btc: false,
        eth: false,
      };

      if (portfolio.hasCash) {
        await setCashByTelegramUserId(options.db, String(input.telegramUserId), portfolio.cashKrw);
        applied.cash = true;
      }

      if (portfolio.hasBtc) {
        await setPositionByTelegramUserId(options.db, String(input.telegramUserId), {
          asset: "BTC",
          quantity: portfolio.btcQuantity,
          averageEntryPrice: portfolio.btcAverageEntryPrice,
        });
        applied.btc = true;
      }

      if (portfolio.hasEth) {
        await setPositionByTelegramUserId(options.db, String(input.telegramUserId), {
          asset: "ETH",
          quantity: portfolio.ethQuantity,
          averageEntryPrice: portfolio.ethAverageEntryPrice,
        });
        applied.eth = true;
      }

      const confirmed = await markPendingImageImportConfirmed(options.db, pending.id);
      return {
        kind: "APPLIED",
        importId: confirmed.id,
        portfolio,
        applied,
        confirmedAt: confirmed.confirmedAt ?? confirmed.updatedAt,
      } satisfies ImageImportConfirmResult;
    },

    async rejectImport(input) {
      const user = await getUserByTelegramUserId(options.db, String(input.telegramUserId));
      if (!user) {
        return { kind: "NOT_FOUND" } satisfies ImageImportRejectResult;
      }

      const pending = await getPendingImageImportById(options.db, input.importId);
      if (!pending || pending.userId !== user.id) {
        return { kind: "NOT_FOUND" } satisfies ImageImportRejectResult;
      }

      await markPendingImageImportRejected(options.db, pending.id, {
        errorMessage: "user_cancelled",
      });
      return {
        kind: "REJECTED",
        importId: pending.id,
      } satisfies ImageImportRejectResult;
    },
  };
}

async function getOrCreateUser(db: D1DatabaseLike, telegramUserId: number) {
  const user = await getUserByTelegramUserId(db, String(telegramUserId));
  if (user) {
    return user;
  }

  return ensureTelegramUser(db, {
    telegramUserId: String(telegramUserId),
    telegramChatId: String(telegramUserId),
  });
}

async function getLatestAwaitingImportId(db: D1DatabaseLike, userId: number) {
  const recent = await listRecentPendingImageImportsForUser(db, userId, 10);
  return recent.find((record) => record.status === "AWAITING_UPLOAD") ?? null;
}

async function expireRecentPendingImports(
  db: D1DatabaseLike,
  userId: number,
  preserveId: number | null = null,
): Promise<void> {
  const recent = await listRecentPendingImageImportsForUser(db, userId, 10);
  const now = Date.now();
  await Promise.all(
    recent
      .filter((record) => record.status === "AWAITING_UPLOAD" || record.status === "PENDING_CONFIRMATION")
      .map(async (record) => {
        if (preserveId !== null && record.id === preserveId) {
          return;
        }

        if (Date.parse(record.expiresAt) <= now) {
          await markPendingImageImportRejected(db, record.id, {
            errorMessage: "expired",
          });
          return;
        }

        if (record.status === "PENDING_CONFIRMATION" || record.status === "AWAITING_UPLOAD") {
          await markPendingImageImportRejected(db, record.id, {
            errorMessage: "superseded",
          });
        }
      }),
  );
}

async function downloadTelegramImage(
  botToken: string,
  fileId: string,
  fallbackMimeType: string,
): Promise<{ mimeType: string; dataUrl: string }> {
  const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!fileResponse.ok) {
    throw new Error(`telegram_file_download_failed:${fileResponse.status}`);
  }

  const fileJson = (await fileResponse.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
  const filePath = fileJson.result?.file_path;
  if (!fileJson.ok || !filePath) {
    throw new Error("telegram_file_path_missing");
  }

  const binaryResponse = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!binaryResponse.ok) {
    throw new Error(`telegram_file_binary_failed:${binaryResponse.status}`);
  }

  const arrayBuffer = await binaryResponse.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_IMPORT_BYTES) {
    throw new Error("image_too_large");
  }

  const mimeType = normalizeOptionalText(binaryResponse.headers.get("content-type")) ?? fallbackMimeType;
  return {
    mimeType,
    dataUrl: `data:${mimeType};base64,${arrayBufferToBase64(arrayBuffer)}`,
  };
}

async function analyzeImageWithOpenAi(input: {
  apiKey: string;
  model: string;
  mimeType: string;
  dataUrl: string;
  locale?: SupportedLocale | null;
}): Promise<ImageImportExtractionResult> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildVisionPrompt(input.locale ?? null),
            },
            {
              type: "input_image",
              image_url: input.dataUrl,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "position_guard_portfolio_import",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "confidence", "summary", "warnings", "portfolio"],
            properties: {
              kind: {
                type: "string",
                enum: ["PORTFOLIO_SNAPSHOT", "TRADE_HISTORY_ROW", "UNKNOWN"],
              },
              confidence: {
                type: "number",
              },
              summary: {
                type: "string",
              },
              warnings: {
                type: "array",
                items: { type: "string" },
              },
              portfolio: {
                type: "object",
                additionalProperties: false,
                required: [
                  "hasCash",
                  "cashKrw",
                  "hasBtc",
                  "btcQuantity",
                  "btcAverageEntryPrice",
                  "hasEth",
                  "ethQuantity",
                  "ethAverageEntryPrice",
                ],
                properties: {
                  hasCash: { type: "boolean" },
                  cashKrw: { type: "number" },
                  hasBtc: { type: "boolean" },
                  btcQuantity: { type: "number" },
                  btcAverageEntryPrice: { type: "number" },
                  hasEth: { type: "boolean" },
                  ethQuantity: { type: "number" },
                  ethAverageEntryPrice: { type: "number" },
                },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`openai_analysis_failed:${response.status}:${errorText}`);
  }

  const payload = await response.json();
  const outputText = extractResponseOutputText(payload);
  if (!outputText) {
    throw new Error("openai_analysis_missing_output");
  }

  return normalizeExtraction(JSON.parse(outputText) as Partial<ImageImportExtractionResult>);
}

function buildVisionPrompt(locale: SupportedLocale | null): string {
  const languageHint = locale === "ko" ? "The screenshot text may be Korean." : "The screenshot text may be English or Korean.";
  return [
    "You are extracting structured values from a cryptocurrency app screenshot for a Telegram record-only portfolio coach.",
    languageHint,
    "Classify the screenshot as one of: PORTFOLIO_SNAPSHOT, TRADE_HISTORY_ROW, UNKNOWN.",
    "PORTFOLIO_SNAPSHOT means a current holdings / asset-status screen showing cash and/or BTC/ETH holdings.",
    "TRADE_HISTORY_ROW means a trade history or fill-history screen rather than current holdings.",
    "Only BTC and ETH matter. Ignore all other assets.",
    "If a value is not clearly visible, set the corresponding has* field to false and the numeric field to 0.",
    "If quantity is 0 or not visible, set average entry price to 0 for that asset.",
    "Return compact factual summary text and any warnings.",
    "Do not invent values. Lower confidence when the screenshot is cropped, blurry, or ambiguous.",
  ].join(" ");
}

function normalizeExtraction(input: Partial<ImageImportExtractionResult>): ImageImportExtractionResult {
  const kind = normalizeKind(input.kind);
  const portfolio = sanitizePortfolio(input.portfolio);
  return {
    kind,
    confidence: clampConfidence(input.confidence),
    summary: typeof input.summary === "string" && input.summary.trim().length > 0
      ? input.summary.trim()
      : "Screenshot parsed.",
    warnings: Array.isArray(input.warnings)
      ? input.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
    portfolio,
  };
}

function sanitizePortfolio(input: Partial<PortfolioSnapshotImportData> | undefined): PortfolioSnapshotImportData {
  const hasCash = input?.hasCash === true;
  const hasBtc = input?.hasBtc === true;
  const hasEth = input?.hasEth === true;

  const btcQuantity = hasBtc ? clampNonNegative(input?.btcQuantity) : 0;
  const ethQuantity = hasEth ? clampNonNegative(input?.ethQuantity) : 0;

  return {
    hasCash,
    cashKrw: hasCash ? clampNonNegative(input?.cashKrw) : 0,
    hasBtc,
    btcQuantity,
    btcAverageEntryPrice: hasBtc && btcQuantity > 0 ? clampNonNegative(input?.btcAverageEntryPrice) : 0,
    hasEth,
    ethQuantity,
    ethAverageEntryPrice: hasEth && ethQuantity > 0 ? clampNonNegative(input?.ethAverageEntryPrice) : 0,
  };
}

function parseExtraction(value: unknown): ImageImportExtractionResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return normalizeExtraction(value as Partial<ImageImportExtractionResult>);
}

function hasAnyPortfolioValues(portfolio: PortfolioSnapshotImportData): boolean {
  return portfolio.hasCash || portfolio.hasBtc || portfolio.hasEth;
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function clampNonNegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return value < 0 ? 0 : value;
}

function normalizeKind(value: unknown): ImageImportExtractionResult["kind"] {
  if (value === "PORTFOLIO_SNAPSHOT" || value === "TRADE_HISTORY_ROW" || value === "UNKNOWN") {
    return value;
  }

  return "UNKNOWN";
}

function extractResponseOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (typeof (payload as { output_text?: unknown }).output_text === "string") {
    const outputText = (payload as { output_text: string }).output_text.trim();
    if (outputText.length > 0) {
      return outputText;
    }
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }

  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        texts.push((part as { text: string }).text);
      }
    }
  }

  const joined = texts.join("\n").trim();
  return joined.length > 0 ? joined : null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function createExpiryIso(): string {
  return new Date(Date.now() + PENDING_IMPORT_TTL_MS).toISOString();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
