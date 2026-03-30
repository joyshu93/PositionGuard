import type {
  AccountState,
  DecisionLogRecord,
  PositionState,
  SupportedAsset,
  SupportedMarket,
  User,
  UserStateBundle,
} from "../domain/types.js";
import type {
  AccountStateRecord,
  DecisionLogInput,
  DecisionLogLookup,
  PositionStateRecord,
  PositionStateInput,
  UserRecord,
  UserStateSnapshot,
} from "../types/persistence.js";
import type { D1DatabaseLike } from "./db.js";
import {
  createDecisionLog,
  getLatestDecisionLogForUserAsset,
} from "./decision-logs.js";
import {
  loadUserStateSnapshotByTelegramId,
  loadUserStateSnapshotByUserId,
  saveUserReportedAccountState,
  saveUserReportedPositionState,
} from "./user-state.js";
import {
  getUserByTelegramId,
  setUserOnboardingComplete,
  setUserSleepMode,
  upsertUser,
} from "./users.js";

interface TelegramProfileInput {
  telegramUserId: string;
  telegramChatId: string;
  username?: string | null;
  displayName?: string | null;
}

export interface RecordDecisionLogParams {
  userId: number;
  asset: SupportedAsset;
  market: SupportedMarket;
  status: DecisionLogInput["decisionStatus"];
  summary: string;
  reasons: string[];
  actionable: boolean;
  contextJson: string;
  notificationSent: boolean;
}

export interface TelegramStatusSnapshot {
  user: User;
  accountState: AccountState | null;
  positions: Partial<Record<SupportedAsset, PositionState>>;
}

export interface TelegramProfileSnapshot {
  telegramUserId: string;
  telegramChatId: string;
  username?: string | null;
  displayName?: string | null;
}

export async function ensureTelegramUser(
  db: D1DatabaseLike,
  input: TelegramProfileInput,
): Promise<User> {
  const record = await upsertUser(db, {
    telegramUserId: input.telegramUserId,
    telegramChatId: input.telegramChatId,
    username: input.username ?? null,
    displayName: input.displayName ?? null,
  });

  return mapUserRecord(record);
}

export async function setCashByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  availableCash: number,
): Promise<AccountState> {
  const record = await saveUserReportedAccountState(db, telegramUserId, {
    availableCash,
  });
  await syncUserSetupCompleteness(db, telegramUserId);

  return mapAccountStateRecord(record);
}

export async function setPositionByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  input: PositionStateInput,
): Promise<PositionState> {
  const record = await saveUserReportedPositionState(db, telegramUserId, input);
  await syncUserSetupCompleteness(db, telegramUserId);

  return mapPositionRecord(record);
}

export async function setSleepModeByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
  enabled: boolean,
): Promise<User> {
  const record = await setUserSleepMode(db, telegramUserId, enabled);
  return mapUserRecord(record);
}

export async function getTelegramStatusSnapshot(
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<TelegramStatusSnapshot | null> {
  const snapshot = await loadUserStateSnapshotByTelegramId(db, telegramUserId);
  if (!snapshot) {
    return null;
  }

  return mapUserStateSnapshot(snapshot);
}

export async function getUserStateBundleByUserId(
  db: D1DatabaseLike,
  userId: number,
): Promise<UserStateBundle | null> {
  const snapshot = await loadUserStateSnapshotByUserId(db, userId);
  return snapshot ? mapUserStateSnapshot(snapshot) : null;
}

export async function listUsersForHourlyRun(
  db: D1DatabaseLike,
): Promise<UserStateBundle[]> {
  const result = await db
    .prepare(
      `SELECT telegram_user_id
       FROM users
       ORDER BY id ASC`,
    )
    .all<{ telegram_user_id: string }>();

  const bundles = await Promise.all(
    result.results.map(async ({ telegram_user_id }) => {
      const snapshot = await loadUserStateSnapshotByTelegramId(db, telegram_user_id);
      return snapshot ? mapUserStateSnapshot(snapshot) : null;
    }),
  );

  return bundles.filter((bundle): bundle is UserStateBundle => bundle !== null);
}

export async function recordDecisionLog(
  db: D1DatabaseLike,
  params: RecordDecisionLogParams,
): Promise<DecisionLogRecord> {
  const record = await createDecisionLog(db, {
    userId: params.userId,
    asset: params.asset,
    symbol: params.market,
    decisionStatus: params.status,
    summary: params.summary,
    reasons: params.reasons,
    actionable: params.actionable,
    notificationEmitted: params.notificationSent,
    context: JSON.parse(params.contextJson) as unknown,
  });

  return {
    id: record.id,
    userId: record.userId,
    market: record.symbol,
    status: record.decisionStatus,
    summary: record.summary,
    contextJson: JSON.stringify(record.context),
    notificationSent: record.notificationEmitted,
    createdAt: record.createdAt,
  };
}

export async function getLatestDecisionLogSummary(
  db: D1DatabaseLike,
  userId: number,
  asset: SupportedAsset,
): Promise<DecisionLogLookup | null> {
  return getLatestDecisionLogForUserAsset(db, userId, asset);
}

export async function getUserByTelegramUserId(
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<User | null> {
  const record = await getUserByTelegramId(db, telegramUserId);
  return record ? mapUserRecord(record) : null;
}

function mapUserStateSnapshot(snapshot: UserStateSnapshot): UserStateBundle {
  return {
    user: mapUserRecord(snapshot.user),
    accountState: snapshot.accountState
      ? mapAccountStateRecord(snapshot.accountState)
      : null,
    positions: mapPositionRecords(snapshot.positionStates),
  };
}

function mapUserRecord(record: UserRecord): User {
  return {
    id: record.id,
    telegramUserId: record.telegramUserId,
    telegramChatId: record.telegramChatId,
    username: record.username,
    displayName: record.displayName,
    sleepModeEnabled: record.sleepMode,
    onboardingComplete: record.onboardingComplete,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapAccountStateRecord(record: AccountStateRecord): AccountState {
  return {
    id: record.id,
    userId: record.userId,
    availableCash: record.availableCash,
    reportedAt: record.reportedAt,
    source: "USER_REPORTED",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapPositionRecords(
  records: PositionStateRecord[],
): Partial<Record<SupportedAsset, PositionState>> {
  const positions: Partial<Record<SupportedAsset, PositionState>> = {};
  for (const record of records) {
    positions[record.asset] = mapPositionRecord(record);
  }
  return positions;
}

function mapPositionRecord(record: PositionStateRecord): PositionState {
  return {
    id: record.id,
    userId: record.userId,
    asset: record.asset,
    quantity: record.quantity,
    averageEntryPrice: record.averageEntryPrice,
    reportedAt: record.reportedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function syncUserSetupCompleteness(
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<void> {
  const snapshot = await loadUserStateSnapshotByTelegramId(db, telegramUserId);
  if (!snapshot) {
    return;
  }

  const hasCash = snapshot.accountState !== null;
  const hasBtc = snapshot.positionStates.some((position) => position.asset === "BTC");
  const hasEth = snapshot.positionStates.some((position) => position.asset === "ETH");

  await setUserOnboardingComplete(db, telegramUserId, hasCash && hasBtc && hasEth);
}
