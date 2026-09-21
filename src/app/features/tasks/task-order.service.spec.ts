import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { DateService } from '../../core/date/date.service';
import { selectTaskOrderIndex } from './store/task.selectors';
import { TaskOrderService } from './task-order.service';
import { EMPTY_TASK_ORDER_INDEX, TaskOrderIndex } from './task-order.util';
import { DEFAULT_TASK, Task } from './task.model';
import { TaskService } from './task.service';

describe('TaskOrderService', () => {
  let service: TaskOrderService;
  let store: MockStore;
  let update: jasmine.Spy;

  const DAY = '2026-03-08';
  const task = (id: string, overrides: Partial<Task> = {}): Task => ({
    ...DEFAULT_TASK,
    id,
    projectId: 'p1',
    dueDay: DAY,
    ...overrides,
  });

  const setIndex = (index: TaskOrderIndex): void => {
    store.overrideSelector(selectTaskOrderIndex, index);
    store.refreshState();
    TestBed.flushEffects();
  };

  beforeEach(() => {
    update = jasmine.createSpy('update');
    TestBed.configureTestingModule({
      providers: [
        provideMockStore(),
        { provide: TaskService, useValue: { update } },
        { provide: DateService, useValue: { getStartOfNextDayDiffMs: () => 0 } },
      ],
    });
    store = TestBed.inject(MockStore);
    // Override before the service subscribes, or the real selector runs on empty state.
    store.overrideSelector(selectTaskOrderIndex, EMPTY_TASK_ORDER_INDEX);
    service = TestBed.inject(TaskOrderService);
    setIndex({
      rankById: { a: 1, b: 2, c: 3 },
      keyedByDay: {
        [DAY]: [
          { id: 'a', orderKey: 10 },
          { id: 'b', orderKey: 20 },
          { id: 'c', orderKey: 30 },
        ],
      },
    });
  });

  afterEach(() => {
    // Selector overrides outlive the spec file otherwise.
    store.resetSelectors();
  });

  it('writes a key between the neighbours of the requested rank', () => {
    service.setRank(task('new'), 2);
    expect(update).toHaveBeenCalledOnceWith('new', { orderKey: 15 });
  });

  it('clamps a rank past the end to last', () => {
    service.setRank(task('new'), 9);
    expect(update).toHaveBeenCalledOnceWith('new', { orderKey: 31 });
  });

  it('does not write when the task already holds that rank', () => {
    service.setRank(task('b', { orderKey: 20 }), 2);
    service.setRank(task('c', { orderKey: 30 }), 9);
    expect(update).not.toHaveBeenCalled();
  });

  it('moves an already keyed task without counting itself', () => {
    service.setRank(task('c', { orderKey: 30 }), 1);
    expect(update).toHaveBeenCalledOnceWith('c', { orderKey: 9 });
  });

  it('ignores a task with no planned day', () => {
    service.setRank(task('nowhere', { dueDay: null }), 1);
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the key only when one is set', () => {
    service.setRank(task('a', { orderKey: 10 }), null);
    service.setRank(task('unkeyed'), null);
    expect(update).toHaveBeenCalledOnceWith('a', { orderKey: null });
  });
});
