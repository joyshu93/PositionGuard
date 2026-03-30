export interface DatabaseLike {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: unknown }>;
}

export type D1DatabaseLike = DatabaseLike;

export const nowIso = (): string => new Date().toISOString();

export const boolToInt = (value: boolean): number => (value ? 1 : 0);
export const intToBool = (value: number | null | undefined): boolean => value === 1;

export const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const stringifyJson = (value: unknown): string | null => {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
};
