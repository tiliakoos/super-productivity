import { Task } from '../task.model';
import { canTaskHaveSubTasks, TaskTreeLookup } from './task-tree.util';

type ConvertibleTaskFields = Pick<
  Task,
  | 'parentId'
  | 'subTaskIds'
  | 'repeatCfgId'
  | 'issueId'
  | 'issueProviderId'
  | 'issueType'
  | 'dueWithTime'
  | 'reminderId'
  | 'remindAt'
>;

export const canConvertTaskToSubTask = (task: ConvertibleTaskFields): boolean =>
  !task.parentId &&
  !task.subTaskIds?.length &&
  !task.repeatCfgId &&
  !task.issueId &&
  !task.issueProviderId &&
  !task.issueType &&
  !task.dueWithTime &&
  !task.reminderId &&
  !task.remindAt;

/**
 * Whether a `convertToSubTask` op may be applied to the given (already
 * looked-up) task and target parent. Used by BOTH the section and crud
 * meta-reducers so their guards stay in lock-step — if they diverge, one
 * reducer can strip the task from its section while the other leaves it
 * top-level. Rejects a missing target, self-nesting, and nesting under a task
 * that is already on the deepest level (`MAX_TASK_DEPTH`).
 */
export const canApplyConvertToSubTask = (
  task: (ConvertibleTaskFields & Pick<Task, 'id'>) | undefined,
  targetParent: Pick<Task, 'id' | 'parentId'> | undefined,
  entities: TaskTreeLookup,
): boolean =>
  !!task &&
  !!targetParent &&
  task.id !== targetParent.id &&
  canTaskHaveSubTasks(targetParent.id, entities) &&
  canConvertTaskToSubTask(task);
