import { Action, ActionReducer, MetaReducer } from '@ngrx/store';
import { Update } from '@ngrx/entity';
import { RootState } from '../../root-state';
import { TaskSharedActions } from '../task-shared.actions';
import {
  PROJECT_FEATURE_NAME,
  projectAdapter,
} from '../../../features/project/store/project.reducer';
import {
  TASK_FEATURE_NAME,
  taskAdapter,
} from '../../../features/tasks/store/task.reducer';
import { Tag } from '../../../features/tag/tag.model';
import { Task, TaskWithSubTasks } from '../../../features/tasks/task.model';
import { TODAY_TAG } from '../../../features/tag/tag.const';
import { INBOX_PROJECT } from '../../../features/project/project.const';
import { TASK_REPEAT_CFG_FEATURE_NAME } from '../../../features/task-repeat-cfg/store/task-repeat-cfg.selectors';
import { unique } from '../../../util/unique';
import {
  flattenNestedSubTasks,
  getAncestorIds,
  getTaskDepth,
  MAX_TASK_DEPTH,
} from '../../../features/tasks/util/task-tree.util';
import { reCalcTimesForParentIfParent } from '../../../features/tasks/store/task.reducer.util';
import {
  ActionHandlerMap,
  collectTaskAndSubTaskIds,
  getProjectOrUndefined,
  getTag,
  getTagOrUndefined,
  removeTasksFromAllProjects,
  removeTasksFromAllTags,
  TaskEntity,
  updateTags,
} from './task-shared-helpers';

// =============================================================================
// ACTION HANDLERS
// =============================================================================

const handleMoveToArchive = (state: RootState, tasks: TaskWithSubTasks[]): RootState => {
  const taskIdsToArchive = collectTaskAndSubTaskIds(
    state,
    tasks.map((task) => task.id),
    tasks.flatMap((task) => [
      ...(task.subTaskIds ?? []),
      ...flattenNestedSubTasks(task.subTasks).map((subTask) => subTask.id),
    ]),
  );

  // Scan every project instead of trusting task.projectId. Older partial updates
  // could leave a task referenced by a different project than the task claims.
  const updatedState = removeTasksFromAllProjects(state, taskIdsToArchive);

  // Scan every tag, not just each task's own `tagIds` — see
  // removeTasksFromAllTags for why (one-sided tag refs after sync).
  return removeTasksFromAllTags(updatedState, taskIdsToArchive);
};

/**
 * Normalizes stale references on a task being restored from archive.
 * Archives may have refs to deleted projects/tags/repeatCfgs (see #6270).
 * We clean these up during restore so the active task passes validation.
 */
const normalizeRestoredTask = <T extends TaskEntity | Task>(
  t: T,
  state: RootState,
): T => {
  // Reassign a deleted projectId to INBOX. Archived projects remain valid
  // task owners and must survive reducer replay.
  let projectId = t.projectId;
  if (projectId && !getProjectOrUndefined(state, projectId)) {
    projectId = getProjectOrUndefined(state, INBOX_PROJECT.id)
      ? INBOX_PROJECT.id
      : undefined;
  }

  // Strip stale tagIds and TODAY_TAG (must never be in task.tagIds)
  const tagIds = (t.tagIds || []).filter(
    (tagId) => tagId !== TODAY_TAG.id && !!getTagOrUndefined(state, tagId),
  );

  // Clear stale repeatCfgId (only present on full Task, not minimal TaskEntity)
  const src = t as Record<string, unknown>;
  const repeatCfgId =
    src['repeatCfgId'] &&
    (state as any)[TASK_REPEAT_CFG_FEATURE_NAME]?.entities?.[src['repeatCfgId'] as string]
      ? src['repeatCfgId']
      : undefined;

  return { ...t, projectId, tagIds, repeatCfgId } as T;
};

const handleRestoreTask = (
  state: RootState,
  task: TaskEntity,
  subTasks: Task[],
): RootState => {
  if (Object.prototype.hasOwnProperty.call(Object.prototype, task.id)) return state;

  // A replayed restore is idempotent when the root is already active. NgRx
  // addMany would otherwise ignore the root but add payload children as
  // orphans the root's subTaskIds never references.
  if (state[TASK_FEATURE_NAME].entities[task.id]?.id === task.id) return state;

  // Normalize stale refs before adding to active state
  const normalizedRestoredTask = normalizeRestoredTask(
    { ...task, isDone: false, doneOn: undefined },
    state,
  );
  // A sub task archived on its own goes back under its parent while that is
  // still active and has room for it; otherwise it comes back top-level.
  const taskEntities = state[TASK_FEATURE_NAME].entities;
  const activeParent = task.parentId ? taskEntities[task.parentId] : undefined;
  const restoreParent =
    activeParent &&
    activeParent.id === task.parentId &&
    getTaskDepth(activeParent.id, taskEntities) < MAX_TASK_DEPTH - 1
      ? activeParent
      : undefined;
  const restoredTask = {
    ...normalizedRestoredTask,
    ...(task.parentId ? { parentId: restoreParent?.id } : {}),
    projectId: restoreParent
      ? restoreParent.projectId
      : (normalizedRestoredTask.projectId ?? ''),
  };
  const declaredSubTaskIds = new Set(restoredTask.subTaskIds ?? []);
  // Nested sub tasks: a payload entry belongs to the restored tree when its
  // parent is the root or an already accepted entry. Repeat until stable, as
  // the payload order is not guaranteed.
  const flatSubTasks = flattenNestedSubTasks(subTasks);
  const acceptedParentIdById = new Map<string, string>();
  let isChanged = true;
  while (isChanged) {
    isChanged = false;
    for (const subTask of flatSubTasks) {
      if (acceptedParentIdById.has(subTask.id) || subTask.id === restoredTask.id) {
        continue;
      }
      const parentId =
        subTask.parentId === restoredTask.id ||
        (!subTask.parentId && declaredSubTaskIds.has(subTask.id))
          ? restoredTask.id
          : subTask.parentId && acceptedParentIdById.has(subTask.parentId)
            ? subTask.parentId
            : undefined;
      if (!parentId) {
        continue;
      }
      const existingSubTask = state[TASK_FEATURE_NAME].entities[subTask.id];
      if (!existingSubTask || existingSubTask.parentId === parentId) {
        acceptedParentIdById.set(subTask.id, parentId);
        isChanged = true;
      }
    }
  }
  const restoredSubTasks = flatSubTasks
    .filter((subTask) => acceptedParentIdById.has(subTask.id))
    .map((subTask) => ({
      ...normalizeRestoredTask(subTask, state),
      parentId: acceptedParentIdById.get(subTask.id) as string,
      projectId: restoredTask.projectId,
    }));

  const updatedTaskState = taskAdapter.addMany(
    [restoredTask as Task, ...restoredSubTasks],
    state[TASK_FEATURE_NAME],
  );

  let updatedState: RootState = {
    ...state,
    [TASK_FEATURE_NAME]: updatedTaskState,
  };

  // Adopt reverse-linked children (already active with parentId → root but
  // missing from the payload/root's subTaskIds) so the restored parent and
  // its children end up in one project with a two-sided relationship.
  const restoreCandidateIds = collectTaskAndSubTaskIds(
    updatedState,
    [restoredTask.id],
    [...(restoredTask.subTaskIds ?? []), ...restoredSubTasks.map((st) => st.id)],
  );
  const verifiedSubTaskIds = restoreCandidateIds.filter(
    (id) =>
      id !== restoredTask.id &&
      updatedState[TASK_FEATURE_NAME].entities[id]?.parentId === restoredTask.id,
  );
  const normalizedSubTaskIds = unique(verifiedSubTaskIds);
  // nested sub tasks below the direct children
  const deeperSubTaskIds = restoreCandidateIds.filter(
    (id) =>
      id !== restoredTask.id &&
      !normalizedSubTaskIds.includes(id) &&
      getAncestorIds(id, updatedState[TASK_FEATURE_NAME].entities).includes(
        restoredTask.id,
      ),
  );
  const restoredTaskIds = [restoredTask.id, ...normalizedSubTaskIds, ...deeperSubTaskIds];
  const restoredTaskUpdates: Update<Task>[] = [
    ...normalizedSubTaskIds,
    ...deeperSubTaskIds,
  ].map((id) => ({
    id,
    changes: { projectId: restoredTask.projectId },
  }));
  if (
    normalizedSubTaskIds.length !== (restoredTask.subTaskIds ?? []).length ||
    normalizedSubTaskIds.some(
      (id, index) => id !== (restoredTask.subTaskIds ?? [])[index],
    )
  ) {
    restoredTaskUpdates.push({
      id: restoredTask.id,
      changes: { subTaskIds: normalizedSubTaskIds },
    });
  }
  updatedState = {
    ...updatedState,
    [TASK_FEATURE_NAME]: taskAdapter.updateMany(
      restoredTaskUpdates,
      updatedState[TASK_FEATURE_NAME],
    ),
  };
  updatedState = removeTasksFromAllProjects(updatedState, restoredTaskIds);

  if (restoreParent) {
    const parent = updatedState[TASK_FEATURE_NAME].entities[restoreParent.id];
    if (parent) {
      updatedState = {
        ...updatedState,
        [TASK_FEATURE_NAME]: reCalcTimesForParentIfParent(
          parent.id,
          taskAdapter.updateOne(
            {
              id: parent.id,
              changes: { subTaskIds: unique([...parent.subTaskIds, restoredTask.id]) },
            },
            updatedState[TASK_FEATURE_NAME],
          ),
        ),
      };
    }
  }

  // Update project (a sub task is listed through its parent instead)
  if (restoredTask.projectId && !restoreParent) {
    const project = getProjectOrUndefined(updatedState, restoredTask.projectId);
    if (project) {
      updatedState = {
        ...updatedState,
        [PROJECT_FEATURE_NAME]: projectAdapter.updateOne(
          {
            id: restoredTask.projectId,
            changes: {
              taskIds: unique([...project.taskIds, restoredTask.id]),
            },
          },
          updatedState[PROJECT_FEATURE_NAME],
        ),
      };
    }
  }

  // Update tags
  const allTasks = restoredTaskIds
    .map((id) => updatedState[TASK_FEATURE_NAME].entities[id])
    .filter((restoredEntity): restoredEntity is Task => !!restoredEntity);
  const tagTaskMap = new Map<string, string[]>();
  for (const restoredEntity of allTasks) {
    for (const tagId of restoredEntity.tagIds ?? []) {
      const taskIds = tagTaskMap.get(tagId) ?? [];
      taskIds.push(restoredEntity.id);
      tagTaskMap.set(tagId, taskIds);
    }
  }

  const tagUpdates = Array.from(tagTaskMap.entries())
    .filter(([tagId]) => getTagOrUndefined(state, tagId))
    .map(
      ([tagId, taskIds]): Update<Tag> => ({
        id: tagId,
        changes: {
          taskIds: unique([...getTag(updatedState, tagId).taskIds, ...taskIds]),
        },
      }),
    );

  return updateTags(updatedState, tagUpdates);
};

// =============================================================================
// META REDUCER
// =============================================================================

const createActionHandlers = (state: RootState, action: Action): ActionHandlerMap => ({
  [TaskSharedActions.moveToArchive.type]: () => {
    const { tasks } = action as ReturnType<typeof TaskSharedActions.moveToArchive>;
    return handleMoveToArchive(state, tasks);
  },
  [TaskSharedActions.restoreTask.type]: () => {
    const { task, subTasks } = action as ReturnType<typeof TaskSharedActions.restoreTask>;
    return handleRestoreTask(state, task, subTasks);
  },
});

export const taskSharedLifecycleMetaReducer: MetaReducer = (
  reducer: ActionReducer<any, Action>,
) => {
  return (state: unknown, action: Action) => {
    if (!state) return reducer(state, action);

    const rootState = state as RootState;
    const actionHandlers = createActionHandlers(rootState, action);
    const handler = actionHandlers[action.type];
    const updatedState = handler ? handler(rootState) : rootState;

    return reducer(updatedState, action);
  };
};
