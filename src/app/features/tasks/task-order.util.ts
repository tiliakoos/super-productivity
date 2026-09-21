import { getDbDateStr } from '../../util/get-db-date-str';

/** The task fields the day order reads; satisfied by `Task` and by `SchedulingSnapshot`. */
export interface TaskOrderSource {
  readonly id: string;
  readonly isDone: boolean;
  readonly dueDay?: string | null;
  readonly dueWithTime?: number | null;
  readonly orderKey?: number | null;
}

export interface TaskOrderEntry {
  readonly id: string;
  readonly orderKey: number;
}

export interface TaskOrderIndex {
  /** 1-based rank of every undone, keyed task among the keyed tasks of its day. */
  readonly rankById: Record<string, number>;
  /** The same tasks per planned day, sorted by key; what a new key is computed against. */
  readonly keyedByDay: Record<string, TaskOrderEntry[]>;
}

export const EMPTY_TASK_ORDER_INDEX: TaskOrderIndex = { rankById: {}, keyedByDay: {} };

/**
 * The logical day a task is planned for: `dueWithTime` wins over `dueDay`
 * (ARCHITECTURE-DECISIONS.md Decision #1), shifted by the start-of-day offset.
 */
export const getTaskPlannedDay = (
  task: Pick<TaskOrderSource, 'dueWithTime' | 'dueDay'>,
  startOfNextDayDiffMs: number,
): string | undefined =>
  typeof task.dueWithTime === 'number'
    ? getDbDateStr(new Date(task.dueWithTime - startOfNextDayDiffMs))
    : (task.dueDay ?? undefined);

export const buildTaskOrderIndex = (
  tasks: readonly TaskOrderSource[],
  startOfNextDayDiffMs: number,
): TaskOrderIndex => {
  const keyedByDay: Record<string, TaskOrderEntry[]> = {};
  for (const task of tasks) {
    if (task.isDone || typeof task.orderKey !== 'number') {
      continue;
    }
    const day = getTaskPlannedDay(task, startOfNextDayDiffMs);
    if (!day) {
      continue;
    }
    (keyedByDay[day] ??= []).push({ id: task.id, orderKey: task.orderKey });
  }

  const rankById: Record<string, number> = {};
  for (const entries of Object.values(keyedByDay)) {
    entries.sort((a, b) => a.orderKey - b.orderKey || a.id.localeCompare(b.id));
    entries.forEach((entry, i) => {
      rankById[entry.id] = i + 1;
    });
  }
  return { rankById, keyedByDay };
};

/**
 * A key that lands a task at `rank` among `sortedKeysOfOthers` without touching
 * any of them: before the first, after the last, or halfway between two neighbours.
 */
export const orderKeyForRank = (
  sortedKeysOfOthers: readonly number[],
  rank: number,
): number => {
  const last = sortedKeysOfOthers.length - 1;
  if (last < 0) {
    return 1;
  }
  if (rank <= 1) {
    return sortedKeysOfOthers[0] - 1;
  }
  if (rank > last + 1) {
    return sortedKeysOfOthers[last] + 1;
  }
  return (sortedKeysOfOthers[rank - 2] + sortedKeysOfOthers[rank - 1]) / 2;
};

/**
 * Bare `1`-`9` set that rank, bare `0` clears (`null`); anything else, including
 * modifier combos, is not an order key (`undefined`).
 */
export const orderRankFromKey = (ev: KeyboardEvent): number | null | undefined => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || !/^[0-9]$/.test(ev.key)) {
    return undefined;
  }
  return Number(ev.key) || null;
};
