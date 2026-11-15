import { Action, ActionReducer } from '@ngrx/store';
import { Task, TaskWithSubTasks } from '../../../features/tasks/task.model';
import {
  TASK_FEATURE_NAME,
  taskReducer,
} from '../../../features/tasks/store/task.reducer';
import { TAG_FEATURE_NAME, tagReducer } from '../../../features/tag/store/tag.reducer';
import {
  PROJECT_FEATURE_NAME,
  projectReducer,
} from '../../../features/project/store/project.reducer';
import {
  plannerFeatureKey,
  plannerReducer,
} from '../../../features/planner/store/planner.reducer';
import { mapSubTasksToTask } from '../../../features/tasks/store/task.selectors';
import { addSubTask, moveSubTask } from '../../../features/tasks/store/task.actions';
import { TimeTrackingActions } from '../../../features/time-tracking/store/time-tracking.actions';
import { getDescendantIds } from '../../../features/tasks/util/task-tree.util';
import { TaskSharedActions } from '../task-shared.actions';
import { RootState } from '../../root-state';
import {
  getLastDeletePayload,
  undoTaskDeleteMetaReducer,
} from '../undo-task-delete.meta-reducer';
import { createCombinedTaskSharedMetaReducer } from './test-helpers';
import { createBaseState, createMockProject, createMockTask } from './test-utils';

// root -> q1 -> partA -> step1 (4 levels) ; root -> q2
const DAY = '2026-11-10';

const createTreeState = (): RootState => {
  const base = createBaseState();
  const tasks: Task[] = [
    createMockTask({
      id: 'root',
      subTaskIds: ['q1', 'q2'],
      timeSpentOnDay: { [DAY]: 30 },
      timeSpent: 30,
    }),
    createMockTask({
      id: 'q1',
      parentId: 'root',
      tagIds: [],
      subTaskIds: ['partA'],
      timeSpentOnDay: { [DAY]: 20 },
      timeSpent: 20,
    }),
    createMockTask({
      id: 'q2',
      parentId: 'root',
      tagIds: [],
      timeSpentOnDay: { [DAY]: 10 },
      timeSpent: 10,
    }),
    createMockTask({
      id: 'partA',
      parentId: 'q1',
      tagIds: [],
      subTaskIds: ['step1'],
      timeSpentOnDay: { [DAY]: 20 },
      timeSpent: 20,
    }),
    createMockTask({
      id: 'step1',
      parentId: 'partA',
      tagIds: [],
      timeSpentOnDay: { [DAY]: 20 },
      timeSpent: 20,
    }),
  ];
  return {
    ...base,
    [TASK_FEATURE_NAME]: {
      ...base[TASK_FEATURE_NAME],
      ids: tasks.map((t) => t.id),
      entities: Object.fromEntries(tasks.map((t) => [t.id, t])),
    },
    [PROJECT_FEATURE_NAME]: {
      ids: ['project1', 'project2'],
      entities: {
        project1: createMockProject({ taskIds: ['root'] }),
        project2: createMockProject({ id: 'project2', taskIds: [] }),
      },
    },
    [TAG_FEATURE_NAME]: {
      ...base[TAG_FEATURE_NAME],
      entities: {
        ...base[TAG_FEATURE_NAME].entities,
        tag1: { ...base[TAG_FEATURE_NAME].entities.tag1!, taskIds: ['root'] },
      },
    },
  };
};

const links = (state: RootState): Record<string, [string | undefined, string[]]> =>
  Object.fromEntries(
    (state[TASK_FEATURE_NAME].ids as string[]).map((id) => {
      const t = state[TASK_FEATURE_NAME].entities[id] as Task;
      return [id, [t.parentId, t.subTaskIds]];
    }),
  );

describe('nested sub tasks (integration)', () => {
  let reducer: ActionReducer<RootState, Action>;
  let initial: RootState;

  const withSubTasks = (state: RootState, id: string): TaskWithSubTasks =>
    mapSubTasksToTask(
      state[TASK_FEATURE_NAME].entities[id] as Task,
      state[TASK_FEATURE_NAME],
    ) as TaskWithSubTasks;

  beforeEach(() => {
    initial = createTreeState();
    const coreReducer: ActionReducer<RootState, Action> = (currentState, action) => {
      const rootState = currentState ?? initial;
      return {
        ...rootState,
        [TASK_FEATURE_NAME]: taskReducer(rootState[TASK_FEATURE_NAME], action),
        [TAG_FEATURE_NAME]: tagReducer(rootState[TAG_FEATURE_NAME], action),
        [PROJECT_FEATURE_NAME]: projectReducer(rootState[PROJECT_FEATURE_NAME], action),
        [plannerFeatureKey]: plannerReducer(rootState[plannerFeatureKey], action),
      };
    };
    reducer = undoTaskDeleteMetaReducer(createCombinedTaskSharedMetaReducer(coreReducer));
  });

  it('rolls tracked time up through every ancestor', () => {
    const state = reducer(
      initial,
      TimeTrackingActions.addTimeSpent({
        task: initial[TASK_FEATURE_NAME].entities.step1 as Task,
        date: DAY,
        duration: 5,
        isFromTrackingReminder: false,
      }),
    );
    const e = state[TASK_FEATURE_NAME].entities;
    expect(e.step1!.timeSpent).toBe(25);
    expect(e.partA!.timeSpent).toBe(25);
    expect(e.q1!.timeSpent).toBe(25);
    expect(e.root!.timeSpent).toBe(35);
    expect(e.root!.timeSpentOnDay[DAY]).toBe(35);
  });

  it('adds a sub task to a third-level task and recalculates every ancestor', () => {
    const state = reducer(
      initial,
      addSubTask({
        task: createMockTask({ id: 'step2', tagIds: [], timeEstimate: 60 }),
        parentId: 'partA',
      }),
    );
    const e = state[TASK_FEATURE_NAME].entities;
    expect(e.partA!.subTaskIds).toEqual(['step1', 'step2']);
    expect(e.step2!.parentId).toBe('partA');
    expect(e.step2!.projectId).toBe('project1');
    expect(e.root!.timeEstimate).toBe(60);
  });

  it('deletes the whole tree and restores it on undo', () => {
    const deleted = reducer(
      initial,
      TaskSharedActions.deleteTask({ task: withSubTasks(initial, 'root') }),
    );
    expect(deleted[TASK_FEATURE_NAME].ids).toEqual([]);
    expect(deleted[PROJECT_FEATURE_NAME].entities.project1!.taskIds).toEqual([]);

    const restored = reducer(
      deleted,
      TaskSharedActions.restoreDeletedTask(getLastDeletePayload()!),
    );
    expect(links(restored)).toEqual(links(initial));
    expect(restored[PROJECT_FEATURE_NAME].entities.project1!.taskIds).toEqual(['root']);
  });

  it('deletes a mid-level task with its sub tasks and undoes it without corrupting the parent', () => {
    const deleted = reducer(
      initial,
      TaskSharedActions.deleteTask({ task: withSubTasks(initial, 'q1') }),
    );
    expect(deleted[TASK_FEATURE_NAME].ids).toEqual(['root', 'q2']);
    expect(deleted[TASK_FEATURE_NAME].entities.root!.subTaskIds).toEqual(['q2']);

    const restored = reducer(
      deleted,
      TaskSharedActions.restoreDeletedTask(getLastDeletePayload()!),
    );
    expect(links(restored)).toEqual(links(initial));
  });

  it('bulk deletes every level', () => {
    const state = reducer(initial, TaskSharedActions.deleteTasks({ taskIds: ['root'] }));
    expect(state[TASK_FEATURE_NAME].ids).toEqual([]);
  });

  it('archives the whole tree and restores every level', () => {
    const archivedRoot = withSubTasks(initial, 'root');
    const archived = reducer(
      initial,
      TaskSharedActions.moveToArchive({ tasks: [archivedRoot] }),
    );
    expect(archived[TASK_FEATURE_NAME].ids).toEqual([]);

    const descendants = getDescendantIds('root', initial[TASK_FEATURE_NAME].entities).map(
      (id) => initial[TASK_FEATURE_NAME].entities[id] as Task,
    );
    const restored = reducer(
      archived,
      TaskSharedActions.restoreTask({
        task: initial[TASK_FEATURE_NAME].entities.root as Task,
        subTasks: descendants,
      }),
    );
    expect(links(restored)).toEqual(links(initial));
  });

  it('moves every level to another project', () => {
    const state = reducer(
      initial,
      TaskSharedActions.moveToOtherProject({
        task: withSubTasks(initial, 'root'),
        targetProjectId: 'project2',
      }),
    );
    for (const id of ['root', 'q1', 'q2', 'partA', 'step1']) {
      expect(state[TASK_FEATURE_NAME].entities[id]!.projectId).toBe('project2');
    }
  });

  it('refuses to move a sub tree past the max depth', () => {
    const state = reducer(
      initial,
      moveSubTask({
        taskId: 'q1',
        srcTaskId: 'root',
        targetTaskId: 'q2',
        afterTaskId: null,
      }),
    );
    expect(links(state)).toEqual(links(initial));
  });

  it('builds nested subTasks for the UI', () => {
    const root = withSubTasks(initial, 'root');
    const q1 = root.subTasks[0] as TaskWithSubTasks;
    const partA = q1.subTasks[0] as TaskWithSubTasks;
    expect(partA.subTasks.map((t) => t.id)).toEqual(['step1']);
  });
});
