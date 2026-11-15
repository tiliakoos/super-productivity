import { Task } from '../task.model';

/**
 * Maximum number of task levels, counting the top-level task: a task at depth
 * `MAX_TASK_DEPTH - 1` cannot get sub tasks of its own.
 */
export const MAX_TASK_DEPTH = 4;

type TaskTreeNode = Pick<Task, 'id' | 'parentId' | 'subTaskIds'>;
export type TaskTreeLookup = Readonly<Record<string, TaskTreeNode | undefined>>;

/** Ancestor ids, nearest first. Stops on a missing parent or a cycle. */
export const getAncestorIds = (taskId: string, entities: TaskTreeLookup): string[] => {
  const ancestorIds: string[] = [];
  const seen = new Set<string>([taskId]);
  let parentId = entities[taskId]?.parentId;
  while (parentId && !seen.has(parentId) && entities[parentId]) {
    ancestorIds.push(parentId);
    seen.add(parentId);
    parentId = entities[parentId]?.parentId;
  }
  return ancestorIds;
};

/** 0 for a top-level task, 1 for its sub task, and so on. */
export const getTaskDepth = (taskId: string, entities: TaskTreeLookup): number =>
  getAncestorIds(taskId, entities).length;

/** All descendant ids, depth first in sub task order. Cycle safe. */
export const getDescendantIds = (taskId: string, entities: TaskTreeLookup): string[] => {
  const result: string[] = [];
  const seen = new Set<string>([taskId]);
  const walk = (id: string): void => {
    for (const childId of entities[id]?.subTaskIds || []) {
      if (seen.has(childId)) {
        continue;
      }
      seen.add(childId);
      result.push(childId);
      walk(childId);
    }
  };
  walk(taskId);
  return result;
};

/** Number of levels below the task: 0 for a leaf. */
export const getSubTreeHeight = (taskId: string, entities: TaskTreeLookup): number => {
  const seen = new Set<string>();
  const height = (id: string): number => {
    if (seen.has(id)) {
      return 0;
    }
    seen.add(id);
    let max = 0;
    for (const childId of entities[id]?.subTaskIds || []) {
      if (entities[childId]) {
        max = Math.max(max, 1 + height(childId));
      }
    }
    return max;
  };
  return height(taskId);
};

export const canTaskHaveSubTasks = (taskId: string, entities: TaskTreeLookup): boolean =>
  !!entities[taskId] && getTaskDepth(taskId, entities) < MAX_TASK_DEPTH - 1;

/**
 * Whether `taskId` (with everything below it) may become a sub task of
 * `newParentId` without creating a cycle or going past `MAX_TASK_DEPTH`.
 */
export const canMoveTaskUnderParent = (
  taskId: string,
  newParentId: string,
  entities: TaskTreeLookup,
): boolean => {
  if (!entities[taskId] || !entities[newParentId] || taskId === newParentId) {
    return false;
  }
  if (getAncestorIds(newParentId, entities).includes(taskId)) {
    return false;
  }
  return (
    getTaskDepth(newParentId, entities) + 1 + getSubTreeHeight(taskId, entities) <
    MAX_TASK_DEPTH
  );
};

type WithNestedSubTasks = { id: string; subTasks?: readonly unknown[] };

/**
 * Flattens (nested) `subTasks` payloads, depth first, parents before their own
 * sub tasks. The nested `subTasks` property is stripped from every result, so
 * entries can be stored as plain task entities.
 */
export const flattenNestedSubTasks = <T extends WithNestedSubTasks>(
  subTasks: readonly T[] | undefined,
): T[] => {
  const result: T[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly T[] | undefined): void => {
    for (const subTask of list || []) {
      if (!subTask || seen.has(subTask.id)) {
        continue;
      }
      seen.add(subTask.id);
      const { subTasks: nested, ...plain } = subTask;
      result.push(plain as unknown as T);
      walk(nested as readonly T[] | undefined);
    }
  };
  walk(subTasks);
  return result;
};

/** Whether any ancestor of the task (nested sub tasks included) is in `idSet`. */
export const hasAncestorInSet = (
  taskId: string,
  entities: Readonly<Record<string, { parentId?: string | null } | undefined>>,
  idSet: ReadonlySet<string>,
): boolean => {
  const seen = new Set<string>([taskId]);
  let parentId = entities[taskId]?.parentId;
  while (parentId && !seen.has(parentId)) {
    if (idSet.has(parentId)) {
      return true;
    }
    seen.add(parentId);
    parentId = entities[parentId]?.parentId;
  }
  return false;
};

/** The top-level task of the tree the task belongs to (itself when top-level). */
export const getRootTaskId = (taskId: string, entities: TaskTreeLookup): string => {
  const ancestorIds = getAncestorIds(taskId, entities);
  return ancestorIds.length ? ancestorIds[ancestorIds.length - 1] : taskId;
};
