import type { D1DatabaseLike } from "./db";
import { getLatestAccountStateForUser, saveAccountStateForUser } from "./account-state";
import { listPositionStatesForUser, savePositionStateForUser } from "./position-state";
import type {
  AccountStateInput,
  AccountStateRecord,
  PositionStateInput,
  PositionStateRecord,
  UserStateSnapshot,
} from "../types/persistence";
import { getUserByTelegramId } from "./users";

export const loadUserStateSnapshotByTelegramId = async (
  db: D1DatabaseLike,
  telegramUserId: string,
): Promise<UserStateSnapshot | null> => {
  const user = await getUserByTelegramId(db, telegramUserId);
  if (!user) {
    return null;
  }

  const [accountState, positionStates] = await Promise.all([
    getLatestAccountStateForUser(db, user.id),
    listPositionStatesForUser(db, user.id),
  ]);

  return {
    user,
    accountState,
    positionStates,
  };
};

export const saveUserReportedAccountState = async (
  db: D1DatabaseLike,
  telegramUserId: string,
  input: AccountStateInput,
): Promise<AccountStateRecord> => {
  const user = await getUserByTelegramId(db, telegramUserId);
  if (!user) {
    throw new Error("User not found");
  }

  return saveAccountStateForUser(db, user.id, input);
};

export const saveUserReportedPositionState = async (
  db: D1DatabaseLike,
  telegramUserId: string,
  input: PositionStateInput,
): Promise<PositionStateRecord> => {
  const user = await getUserByTelegramId(db, telegramUserId);
  if (!user) {
    throw new Error("User not found");
  }

  return savePositionStateForUser(db, user.id, input);
};
