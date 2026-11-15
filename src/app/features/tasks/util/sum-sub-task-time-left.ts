import { Task } from '../task.model';

/**
 * The work still outstanding across sub tasks: a done sub task contributes nothing,
 * and one that has run over its estimate is clamped at 0 rather than going negative.
 * A sub task with sub tasks of its own already holds its time left as its
 * `timeEstimate`, so it contributes that directly.
 *
 * This is the value a parent task's `timeEstimate` holds. It is shared with the task
 * row so what is rendered cannot drift from what the reducer writes.
 */
export const sumSubTaskTimeLeft = (subTasks: Task[]): number =>
  subTasks?.length
    ? subTasks.reduce(
        (acc, subTask) =>
          acc +
          (subTask.isDone
            ? 0
            : subTask.subTaskIds?.length
              ? subTask.timeEstimate
              : Math.max(0, subTask.timeEstimate - subTask.timeSpent)),
        0,
      )
    : 0;
