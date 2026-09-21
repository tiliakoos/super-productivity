import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { select, Store } from '@ngrx/store';
import { DateService } from '../../core/date/date.service';
import { selectTaskOrderIndex } from './store/task.selectors';
import { Task } from './task.model';
import { TaskService } from './task.service';
import {
  EMPTY_TASK_ORDER_INDEX,
  getTaskPlannedDay,
  orderKeyForRank,
} from './task-order.util';

/**
 * Per-day task order: the badge rank every row shows and the one write that
 * positions a task. The rank is derived (see `buildTaskOrderIndex`), so marking a
 * task done or undone needs no write here.
 */
@Injectable({ providedIn: 'root' })
export class TaskOrderService {
  private readonly _store = inject(Store);
  private readonly _taskService = inject(TaskService);
  private readonly _dateService = inject(DateService);

  // Shared signal to avoid one store subscription per rendered task row
  readonly index = toSignal(this._store.pipe(select(selectTaskOrderIndex)), {
    initialValue: EMPTY_TASK_ORDER_INDEX,
  });

  /** Put `task` at `rank` (1-based) among its day's ordered tasks, or clear it with `null`. */
  setRank(task: Task, rank: number | null): void {
    if (rank === null) {
      if (typeof task.orderKey === 'number') {
        this._taskService.update(task.id, { orderKey: null });
      }
      return;
    }

    const day = getTaskPlannedDay(task, this._dateService.getStartOfNextDayDiffMs());
    if (!day) {
      return;
    }
    const index = this.index();
    const siblings = (index.keyedByDay[day] ?? []).filter((e) => e.id !== task.id);
    const targetRank = Math.min(rank, siblings.length + 1);
    if (index.rankById[task.id] === targetRank) {
      return;
    }
    this._taskService.update(task.id, {
      orderKey: orderKeyForRank(
        siblings.map((e) => e.orderKey),
        targetRank,
      ),
    });
  }
}
