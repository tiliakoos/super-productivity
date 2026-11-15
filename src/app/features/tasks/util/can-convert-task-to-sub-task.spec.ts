import { Task } from '../task.model';
import { TaskTreeLookup } from './task-tree.util';
import {
  canApplyConvertToSubTask,
  canConvertTaskToSubTask,
} from './can-convert-task-to-sub-task';

// An eligible top-level task: every guard field empty.
const eligible = (): Parameters<typeof canConvertTaskToSubTask>[0] => ({
  parentId: undefined,
  subTaskIds: [],
  repeatCfgId: undefined,
  issueId: undefined,
  issueProviderId: undefined,
  issueType: undefined,
  dueWithTime: undefined,
  reminderId: undefined,
  remindAt: undefined,
});

describe('canConvertTaskToSubTask', () => {
  it('accepts a plain top-level task with no blocking fields', () => {
    expect(canConvertTaskToSubTask(eligible())).toBe(true);
  });

  it('rejects a task that is already a subtask', () => {
    expect(canConvertTaskToSubTask({ ...eligible(), parentId: 'p1' })).toBe(false);
  });

  it('rejects a task that already has subtasks', () => {
    expect(canConvertTaskToSubTask({ ...eligible(), subTaskIds: ['s1'] })).toBe(false);
  });

  it('rejects a repeating task', () => {
    expect(canConvertTaskToSubTask({ ...eligible(), repeatCfgId: 'r1' })).toBe(false);
  });

  it('rejects an issue-provider task', () => {
    expect(canConvertTaskToSubTask({ ...eligible(), issueId: 'i1' })).toBe(false);
    expect(canConvertTaskToSubTask({ ...eligible(), issueProviderId: 'ip1' })).toBe(
      false,
    );
    expect(
      canConvertTaskToSubTask({
        ...eligible(),
        issueType: 'JIRA' as Task['issueType'],
      }),
    ).toBe(false);
  });

  it('rejects a scheduled / reminder task', () => {
    expect(canConvertTaskToSubTask({ ...eligible(), dueWithTime: 1234 })).toBe(false);
    expect(canConvertTaskToSubTask({ ...eligible(), reminderId: 'rem1' })).toBe(false);
    expect(canConvertTaskToSubTask({ ...eligible(), remindAt: 1234 })).toBe(false);
  });
});

describe('canApplyConvertToSubTask', () => {
  const task = { ...eligible(), id: 't1' };
  const parent: Pick<Task, 'id' | 'parentId'> = { id: 'p1', parentId: undefined };
  // p1 (top level) -> l1 -> l2 -> l3 (deepest allowed level)
  const entities: TaskTreeLookup = {
    p1: { id: 'p1', subTaskIds: ['l1'] },
    l1: { id: 'l1', parentId: 'p1', subTaskIds: ['l2'] },
    l2: { id: 'l2', parentId: 'l1', subTaskIds: ['l3'] },
    l3: { id: 'l3', parentId: 'l2', subTaskIds: [] },
    same: { id: 'same', subTaskIds: [] },
  };

  it('accepts an eligible task onto a valid top-level parent', () => {
    expect(canApplyConvertToSubTask(task, parent, entities)).toBe(true);
  });

  it('rejects when the task is missing', () => {
    expect(canApplyConvertToSubTask(undefined, parent, entities)).toBe(false);
  });

  it('rejects when the target parent is missing', () => {
    expect(canApplyConvertToSubTask(task, undefined, entities)).toBe(false);
  });

  it('rejects self-nesting', () => {
    expect(
      canApplyConvertToSubTask(
        { ...task, id: 'same' },
        { id: 'same', parentId: undefined },
        entities,
      ),
    ).toBe(false);
  });

  it('accepts nesting under a sub task above the max depth', () => {
    expect(canApplyConvertToSubTask(task, { id: 'l2', parentId: 'l1' }, entities)).toBe(
      true,
    );
  });

  it('rejects nesting under a task on the deepest level', () => {
    expect(canApplyConvertToSubTask(task, { id: 'l3', parentId: 'l2' }, entities)).toBe(
      false,
    );
  });

  it('rejects an ineligible task (already a subtask)', () => {
    expect(canApplyConvertToSubTask({ ...task, parentId: 'x' }, parent, entities)).toBe(
      false,
    );
  });
});
