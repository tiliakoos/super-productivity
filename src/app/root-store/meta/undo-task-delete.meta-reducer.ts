import { RootState } from '../root-state';
import { Dictionary } from '@ngrx/entity';
import { Task, TaskWithSubTasks } from '../../features/tasks/task.model';
import { TaskSharedActions } from './task-shared.actions';
import { PROJECT_FEATURE_NAME } from '../../features/project/store/project.reducer';
import { TASK_FEATURE_NAME } from '../../features/tasks/store/task.reducer';
import { TAG_FEATURE_NAME } from '../../features/tag/store/tag.reducer';
import { Project } from '../../features/project/project.model';
import { Action, ActionReducer } from '@ngrx/store';
import { TODAY_TAG } from '../../features/tag/tag.const';
import { Log } from '../../core/log';
import { PersistentAction } from '../../op-log/core/persistent-action.interface';
import {
  flattenNestedSubTasks,
  getDescendantIds,
} from '../../features/tasks/util/task-tree.util';

/**
 * Payload structure for restoring a deleted task.
 * Contains all data needed to restore task entities and their associations.
 */
export interface RestoreDeletedTaskPayload {
  // The deleted task with its subtasks
  task: TaskWithSubTasks;

  // Project context (if task was in a project)
  projectContext?: {
    projectId: string;
    taskIdsForProject: string[];
    taskIdsForProjectBacklog: string[];
  };

  // Parent-child relationship (if task was a subtask)
  parentContext?: {
    parentTaskId: string;
    subTaskIds: string[];
  };

  // Tag associations (tagId -> taskIds array at time of deletion)
  tagTaskIdMap: Record<string, string[]>;

  // All deleted task entities (main task + subtasks)
  deletedTaskEntities: Dictionary<Task>;
}

let lastDeletePayload: RestoreDeletedTaskPayload | null = null;

/**
 * Gets and clears the last captured delete payload.
 * Used by the snackbar effect to dispatch restoreDeletedTask with full data.
 */
export const getLastDeletePayload = (): RestoreDeletedTaskPayload | null => {
  const payload = lastDeletePayload;
  lastDeletePayload = null;
  return payload;
};

/**
 * Meta-reducer that captures task state before deletion.
 * This runs before the main reducer, allowing us to capture project/tag context
 * that would be lost after the delete reducer runs.
 *
 * The captured payload is retrieved via getLastDeletePayload() and used
 * by the snackbar effect to dispatch restoreDeletedTask with full data.
 *
 * The capture is only committed once the delete reducer has returned: since
 * #10195 a throw further in is caught by reducerFailureGuardMetaReducer and
 * the app keeps running, so an early write would leave a payload for a delete
 * that never happened — and an undo snack still open from the PREVIOUS delete
 * would then restore the wrong task (a synced write). Remote deletes are
 * skipped entirely: they never show an undo snack, so capturing them could
 * only overwrite the payload a local delete's snack still holds.
 */
export const undoTaskDeleteMetaReducer = (
  reducer: ActionReducer<any, any>,
): ActionReducer<any, any> => {
  return (state: RootState, action: Action) => {
    if (action.type === TaskSharedActions.deleteTask.type) {
      if ((action as PersistentAction).meta.isRemote) {
        // Replayed ops (sync, hydration) show no undo snack, but capturing
        // here would overwrite the payload a local delete's snack still holds.
        return reducer(state, action);
      }
      const { task } = action as ReturnType<typeof TaskSharedActions.deleteTask>;
      const payload = captureTaskDeletePayload(state, task);
      const nextState = reducer(state, action);
      lastDeletePayload = payload;
      return nextState;
    }
    return reducer(state, action);
  };
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a dictionary of all tasks to be deleted (main task + every level of
 * sub tasks), preferring the state entities over the payload copies.
 */
const createDeletedTaskEntities = (
  state: RootState,
  task: TaskWithSubTasks,
): Dictionary<Task> => {
  const entities = state[TASK_FEATURE_NAME].entities;
  const { subTasks, ...plainTask } = task;
  const result: Dictionary<Task> = { [task.id]: entities[task.id] ?? plainTask };
  for (const subTask of flattenNestedSubTasks(subTasks)) {
    result[subTask.id] = entities[subTask.id] ?? subTask;
  }
  for (const id of getDescendantIds(task.id, entities)) {
    if (entities[id]) {
      result[id] = entities[id];
    }
  }
  return result;
};

/**
 * Builds a map of tag IDs to their task arrays for all deleted tasks
 */
const buildTagTaskIdMap = (
  state: RootState,
  allDeletedTasks: Task[],
): Record<string, string[]> => {
  const tagState = state[TAG_FEATURE_NAME];
  const tagMap: Record<string, string[]> = {};

  for (const task of allDeletedTasks) {
    const tagIds = [TODAY_TAG.id, ...(task.tagIds || [])];

    for (const tagId of tagIds) {
      const tag = tagState.entities[tagId];
      if (tag?.taskIds.includes(task.id) && !tagMap[tagId]) {
        tagMap[tagId] = tag.taskIds;
      }
    }
  }

  return tagMap;
};

/**
 * Captures project-specific data for a task deletion
 */
const captureProjectContext = (
  state: RootState,
  projectId: string | null,
): RestoreDeletedTaskPayload['projectContext'] | undefined => {
  if (!projectId) {
    return undefined;
  }

  const project = state[PROJECT_FEATURE_NAME].entities[projectId] as Project | undefined;
  if (!project) {
    return undefined;
  }

  if (!project.taskIds || !project.backlogTaskIds) {
    Log.err('Invalid project data:', {
      projectId,
      hasTaskIds: !!project.taskIds,
      hasBacklogTaskIds: !!project.backlogTaskIds,
    });
    throw new Error('Invalid project data');
  }

  return {
    projectId,
    taskIdsForProject: project.taskIds,
    taskIdsForProjectBacklog: project.backlogTaskIds,
  };
};

/**
 * Captures the complete payload needed to restore a deleted task.
 * Called by the meta-reducer before the delete reducer runs.
 */
const captureTaskDeletePayload = (
  state: RootState,
  task: TaskWithSubTasks,
): RestoreDeletedTaskPayload => {
  const deletedTaskEntities = createDeletedTaskEntities(state, task);
  const allDeletedTasks = Object.values(deletedTaskEntities).filter(
    (t): t is Task => !!t,
  );
  const tagTaskIdMap = buildTagTaskIdMap(state, allDeletedTasks);

  // Handle subtask deletion - capture parent context
  if (task.parentId) {
    const parentTask = state[TASK_FEATURE_NAME].entities[task.parentId];
    return {
      task,
      parentContext: {
        parentTaskId: task.parentId,
        subTaskIds: parentTask?.subTaskIds || [],
      },
      tagTaskIdMap,
      deletedTaskEntities,
    };
  }

  // Handle main task deletion - capture project context
  return {
    task,
    projectContext: captureProjectContext(state, task.projectId),
    tagTaskIdMap,
    deletedTaskEntities,
  };
};
