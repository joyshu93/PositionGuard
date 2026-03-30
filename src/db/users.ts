import { boolToInt, intToBool, nowIso } from "./db.js";
import type { D1DatabaseLike } from "./db.js";
import type { UserProfileInput, UserRecord } from "../types/persistence.js";

type UserRow = {
  id: number;
  telegram_user_id: string;
  telegram_chat_id: string | null;
  username: string | null;
  display_name: string | null;
  sleep_mode: number;
  onboarding_complete: number;
  created_at: string;
  updated_at: string;
};

const mapUserRow = (row: UserRow): UserRecord => ({
  id: row.id,
  telegramUserId: row.telegram_user_id,
  telegramChatId: row.telegram_chat_id,
  username: row.username,
  displayName: row.display_name,
  sleepMode: intToBool(row.sleep_mode),
  onboardingComplete: intToBool(row.onboarding_complete),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getUserByTelegramId = async (
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<UserRecord | null> => {
  const row = await db
    .prepare(
      `SELECT id, telegram_user_id, telegram_chat_id, username, display_name, sleep_mode, onboarding_complete, created_at, updated_at
       FROM users
       WHERE telegram_user_id = ?`,
    )
    .bind(telegramUserId)
    .first<UserRow>();

  return row ? mapUserRow(row) : null;
};

export const upsertUser = async (
  db: D1DatabaseLike,
  input: UserProfileInput,
): Promise<UserRecord> => {
  const existing = await getUserByTelegramId(db, input.telegramUserId);
  const timestamp = nowIso();

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO users (telegram_user_id, telegram_chat_id, username, display_name, sleep_mode, onboarding_complete, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      )
      .bind(
        input.telegramUserId,
        input.telegramChatId ?? null,
        input.username ?? null,
        input.displayName ?? null,
        timestamp,
        timestamp,
      )
      .run();

    const created = await getUserByTelegramId(db, input.telegramUserId);
    if (!created) {
      throw new Error("Failed to create user record");
    }
    return created;
  }

  await db
    .prepare(
      `UPDATE users
       SET telegram_chat_id = COALESCE(?, telegram_chat_id),
           username = COALESCE(?, username),
           display_name = COALESCE(?, display_name),
           updated_at = ?
       WHERE telegram_user_id = ?`,
    )
    .bind(
      input.telegramChatId ?? null,
      input.username ?? null,
      input.displayName ?? null,
      timestamp,
      input.telegramUserId,
    )
    .run();

  const updated = await getUserByTelegramId(db, input.telegramUserId);
  if (!updated) {
    throw new Error("Failed to refresh user record");
  }
  return updated;
};

export const setUserSleepMode = async (
  db: D1DatabaseLike,
  telegramUserId: string,
  sleepMode: boolean,
): Promise<UserRecord> => {
  await db
    .prepare(
      `UPDATE users
       SET sleep_mode = ?, updated_at = ?
       WHERE telegram_user_id = ?`,
    )
    .bind(boolToInt(sleepMode), nowIso(), telegramUserId)
    .run();

  const user = await getUserByTelegramId(db, telegramUserId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

export const setUserOnboardingComplete = async (
  db: D1DatabaseLike,
  telegramUserId: string,
  onboardingComplete: boolean,
): Promise<UserRecord> => {
  await db
    .prepare(
      `UPDATE users
       SET onboarding_complete = ?, updated_at = ?
       WHERE telegram_user_id = ?`,
    )
    .bind(boolToInt(onboardingComplete), nowIso(), telegramUserId)
    .run();

  const user = await getUserByTelegramId(db, telegramUserId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};
