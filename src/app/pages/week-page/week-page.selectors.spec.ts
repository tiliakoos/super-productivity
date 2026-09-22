import { DEFAULT_TASK, Task } from '../../features/tasks/task.model';
import { selectAllTasksInActiveProjects } from '../../features/tasks/store/task.selectors';
import { selectWeekDays } from './week-page.selectors';
import { EMPTY_TASK_ORDER_INDEX } from '../../features/tasks/task-order.util';
import { PlannerState } from '../../features/planner/store/planner.reducer';

describe('selectWeekDays', () => {
  const emptyPlanner: PlannerState = {
    days: {},
    addPlannedTasksDialogLastShown: undefined,
  };

  it('builds the seven-day logical window and groups each active task once', () => {
    const today = '2026-03-08';
    const offsetMs = 4 * 60 * 60 * 1000;
    const task = (id: string, overrides: Partial<Task>): Task => ({
      ...DEFAULT_TASK,
      id,
      projectId: 'active-project',
      ...overrides,
    });
    const allTasks = [
      task('today', { dueDay: today }),
      task('logical-today-time', {
        dueWithTime: new Date(2026, 2, 9, 2).getTime(),
      }),
      task('tomorrow', { dueDay: '2026-03-09' }),
      task('duplicate', {
        dueDay: '2026-03-10',
        dueWithTime: new Date(2026, 2, 10, 12).getTime(),
      }),
      task('conflicting-legacy-fields', {
        dueDay: '2026-03-09',
        dueWithTime: new Date(2026, 2, 10, 12).getTime(),
      }),
      task('last-day', { dueDay: '2026-03-14' }),
      task('out-of-window', { dueDay: '2026-03-15' }),
      task('archived-project', {
        projectId: 'archived-project',
        dueDay: '2026-03-09',
      }),
    ];
    const activeTasks = selectAllTasksInActiveProjects.projector(
      allTasks,
      new Set(['archived-project']),
    );

    const result = selectWeekDays.projector(
      activeTasks,
      today,
      offsetMs,
      [],
      emptyPlanner,
      EMPTY_TASK_ORDER_INDEX,
    );

    expect(result.map((day) => day.day)).toEqual([
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
    ]);
    expect(result[0].tasks.map((t) => t.id)).toEqual(['today', 'logical-today-time']);
    expect(result[1].tasks.map((t) => t.id)).toEqual(['tomorrow']);
    expect(result[2].tasks.map((t) => t.id)).toEqual([
      'duplicate',
      'conflicting-legacy-fields',
    ]);
    expect(result[6].tasks.map((t) => t.id)).toEqual(['last-day']);
    expect(
      result.every((day) => !day.tasks.some((t) => t.id === 'archived-project')),
    ).toBe(true);
    expect(result.every((day) => !day.tasks.some((t) => t.id === 'out-of-window'))).toBe(
      true,
    );
  });
  it('orders today by the Today list and other days by their planner day', () => {
    const today = '2026-03-08';
    const tomorrow = '2026-03-09';
    const task = (id: string, dueDay: string): Task => ({
      ...DEFAULT_TASK,
      id,
      projectId: 'active-project',
      dueDay,
    });
    const activeTasks = selectAllTasksInActiveProjects.projector(
      [
        task('a', today),
        task('b', today),
        task('c', today),
        task('x', tomorrow),
        task('y', tomorrow),
      ],
      new Set(),
    );

    const result = selectWeekDays.projector(
      activeTasks,
      today,
      0,
      ['c', 'a'],
      { ...emptyPlanner, days: { [tomorrow]: ['y', 'x'] } },
      EMPTY_TASK_ORDER_INDEX,
    );

    expect(result[0].tasks.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(result[1].tasks.map((t) => t.id)).toEqual(['y', 'x']);
  });
});
