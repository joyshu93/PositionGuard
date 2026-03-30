import {
  assertRuntimeConfig,
  getRuntimeConfigReport,
} from "../src/env.js";
import { assert, assertEqual } from "./test-helpers.js";

const validReport = getRuntimeConfigReport(
  {
    DB: {
      prepare() {
        throw new Error("not used");
      },
    } as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET: "secret-token",
    HEALTH_PATH: "/healthz",
    TELEGRAM_WEBHOOK_PATH: "/telegram/webhook",
    UPBIT_BASE_URL: "https://api.upbit.com",
  },
  "webhook",
);

assertEqual(validReport.ok, true, "A complete deployment config should validate.");
assertEqual(validReport.healthPath, "/healthz", "Configured health path should be preserved.");

const invalidReport = getRuntimeConfigReport(
  {
    DB: null as unknown as D1Database,
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_WEBHOOK_SECRET: "",
    HEALTH_PATH: "health",
    TELEGRAM_WEBHOOK_PATH: "telegram/webhook",
    UPBIT_BASE_URL: "notaurl",
  },
  "webhook",
);

assertEqual(invalidReport.ok, false, "An incomplete deployment config should fail validation.");
assert(
  invalidReport.errors.some((error) => error.includes("D1 binding")),
  "Validation should report a missing D1 binding.",
);
assert(
  invalidReport.errors.some((error) => error.includes("TELEGRAM_BOT_TOKEN")),
  "Validation should report a missing bot token.",
);
assert(
  invalidReport.errors.some((error) => error.includes("TELEGRAM_WEBHOOK_SECRET")),
  "Validation should report a missing webhook secret.",
);
assert(
  invalidReport.healthPath === "/health",
  "Validation should normalize health paths into a safe route shape.",
);
assert(
  invalidReport.errors.some((error) => error.includes("UPBIT_BASE_URL")),
  "Validation should report invalid Upbit override URLs.",
);

let threw = false;
try {
  assertRuntimeConfig(
    {
      DB: null as unknown as D1Database,
      TELEGRAM_BOT_TOKEN: "",
    },
    "scheduled",
  );
} catch (error) {
  threw = true;
  assert(
    error instanceof Error && error.message.includes("scheduled"),
    "assertRuntimeConfig should include the failing scope.",
  );
}

assertEqual(threw, true, "assertRuntimeConfig should throw when scheduled config is invalid.");
