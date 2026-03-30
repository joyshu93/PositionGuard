import {
  normalizeAsset,
  normalizeNumericInput,
  validateAvailableCash,
  validatePositionInput,
} from "../src/validation.js";
import { assert, assertEqual } from "./test-helpers.js";

assertEqual(
  normalizeNumericInput("1,234.56"),
  1234.56,
  "normalizeNumericInput should parse formatted numbers.",
);

assertEqual(normalizeAsset("btc"), "BTC", "normalizeAsset should normalize BTC.");
assertEqual(normalizeAsset("xrp"), null, "normalizeAsset should reject unsupported assets.");

assert(
  validateAvailableCash("500000").ok,
  "validateAvailableCash should accept non-negative numbers.",
);
assert(
  !validateAvailableCash("-1").ok,
  "validateAvailableCash should reject negative values.",
);

const positionResult = validatePositionInput({
  asset: "ETH",
  quantity: "1.25",
  averageEntryPrice: "4000000",
});

assert(positionResult.ok, "validatePositionInput should accept ETH spot input.");
assertEqual(
  positionResult.value?.asset ?? null,
  "ETH",
  "validatePositionInput should preserve the normalized asset.",
);
