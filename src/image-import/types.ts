import type { SupportedLocale } from "../domain/types.js";

export type ImageImportKind =
  | "PORTFOLIO_SNAPSHOT"
  | "TRADE_HISTORY_ROW"
  | "UNKNOWN";

export type PendingImageImportStatus =
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "REJECTED"
  | "FAILED"
  | "EXPIRED";

export type ImageImportSourceKind = "PHOTO" | "DOCUMENT";

export interface PortfolioSnapshotImportData {
  hasCash: boolean;
  cashKrw: number;
  hasBtc: boolean;
  btcQuantity: number;
  btcAverageEntryPrice: number;
  hasEth: boolean;
  ethQuantity: number;
  ethAverageEntryPrice: number;
}

export interface ImageImportExtractionResult {
  kind: ImageImportKind;
  confidence: number;
  summary: string;
  warnings: string[];
  portfolio: PortfolioSnapshotImportData;
}

export interface ImageImportMediaInput {
  telegramUserId: number;
  telegramChatId: number;
  telegramMessageId?: number;
  username?: string | null;
  displayName?: string | null;
  languageCode?: string | null;
  preferredLocale?: SupportedLocale | null;
  sourceKind: ImageImportSourceKind;
  telegramFileId: string;
  mimeType: string;
  caption?: string | null;
}

export type ImageImportProcessingResult =
  | {
      kind: "UNAVAILABLE";
      messageKey: "not_configured";
    }
  | {
      kind: "UNSUPPORTED_MEDIA";
      messageKey: "unsupported_media";
    }
  | {
      kind: "FAILED";
      messageKey: "download_failed" | "analysis_failed" | "invalid_payload";
      detail?: string | null;
    }
  | {
      kind: "UNSUPPORTED_KIND";
      detectedKind: Exclude<ImageImportKind, "PORTFOLIO_SNAPSHOT">;
      confidence: number;
      summary: string;
      warnings: string[];
    }
  | {
      kind: "LOW_CONFIDENCE";
      confidence: number;
      summary: string;
      warnings: string[];
    }
  | {
      kind: "PENDING_CONFIRMATION";
      importId: number;
      confidence: number;
      summary: string;
      warnings: string[];
      portfolio: PortfolioSnapshotImportData;
      expiresAt: string;
    };

export type ImageImportConfirmResult =
  | {
      kind: "NOT_FOUND";
    }
  | {
      kind: "EXPIRED";
    }
  | {
      kind: "APPLIED";
      importId: number;
      portfolio: PortfolioSnapshotImportData;
      applied: {
        cash: boolean;
        btc: boolean;
        eth: boolean;
      };
      confirmedAt: string;
    };

export type ImageImportRejectResult =
  | {
      kind: "NOT_FOUND";
    }
  | {
      kind: "REJECTED";
      importId: number;
    };

export type ImageImportBeginResult =
  | {
      kind: "UNAVAILABLE";
      messageKey: "not_configured";
    }
  | {
      kind: "READY";
      importId: number;
      expiresAt: string;
    };

export interface TelegramImageImportProvider {
  isConfigured(): boolean;
  beginImport(input: {
    telegramUserId: number;
  }): Promise<ImageImportBeginResult>;
  processMedia(input: ImageImportMediaInput): Promise<ImageImportProcessingResult>;
  confirmImport(input: {
    telegramUserId: number;
    importId: number;
  }): Promise<ImageImportConfirmResult>;
  rejectImport(input: {
    telegramUserId: number;
    importId: number;
  }): Promise<ImageImportRejectResult>;
}
