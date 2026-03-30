import type { SupportedAsset } from "./domain/types";

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

export interface AccountStateInput {
  availableCash: number;
}

export interface PositionStateInput {
  asset: SupportedAsset;
  quantity: number;
  averageEntryPrice: number;
}

export function validateAvailableCash(
  input: string | number,
): ValidationResult<AccountStateInput> {
  const value = normalizeNumericInput(input);
  if (value === null || value < 0) {
    return {
      ok: false,
      errors: ["Available cash must be a non-negative number."],
    };
  }

  return {
    ok: true,
    value: { availableCash: value },
    errors: [],
  };
}

export function validatePositionInput(input: {
  asset: string;
  quantity: string | number;
  averageEntryPrice: string | number;
}): ValidationResult<PositionStateInput> {
  const asset = normalizeAsset(input.asset);
  const quantity = normalizeNumericInput(input.quantity);
  const averageEntryPrice = normalizeNumericInput(input.averageEntryPrice);
  const errors: string[] = [];

  if (asset === null) {
    errors.push("Asset must be BTC or ETH.");
  }
  if (quantity === null || quantity < 0) {
    errors.push("Quantity must be a non-negative number.");
  }
  if (averageEntryPrice === null || averageEntryPrice < 0) {
    errors.push("Average entry price must be a non-negative number.");
  }

  if (errors.length > 0 || asset === null || quantity === null || averageEntryPrice === null) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: { asset, quantity, averageEntryPrice },
    errors: [],
  };
}

export function normalizeNumericInput(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }

  const sanitized = input.replace(/,/g, "").trim();
  if (sanitized.length === 0) {
    return null;
  }

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAsset(input: string): SupportedAsset | null {
  const upper = input.trim().toUpperCase();
  if (upper === "BTC" || upper === "ETH") {
    return upper;
  }
  return null;
}
