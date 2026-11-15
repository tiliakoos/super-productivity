import { inject, Injectable, Signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectTaskFeatureState } from './store/task.selectors';
import { Task, TaskState } from './task.model';
import {
  canMoveTaskUnderParent,
  canTaskHaveSubTasks,
  TaskTreeLookup,
} from './util/task-tree.util';

/**
 * Nested sub task checks for the UI, against the current task state. Reads the
 * store lazily, so injecting it costs nothing until a check runs. A task the
 * state does not know (yet) falls back to the one-level rule.
 */
@Injectable({
  providedIn: 'root',
})
export class TaskTreeService {
  private readonly _store = inject(Store);
  private _taskState?: Signal<TaskState | undefined>;

  private _entities(): TaskTreeLookup {
    this._taskState ??= this._store.selectSignal(selectTaskFeatureState);
    return this._taskState()?.entities ?? {};
  }

  canAddSubTaskTo(task: Pick<Task, 'id' | 'parentId'>): boolean {
    const entities = this._entities();
    return entities[task.id] ? canTaskHaveSubTasks(task.id, entities) : !task.parentId;
  }

  /**
   * "Add sub task" nests under the task itself while it is above the max depth;
   * on the deepest level the new task becomes its sibling instead.
   */
  getParentIdForNewSubTask(task: Pick<Task, 'id' | 'parentId'>): string {
    return this.canAddSubTaskTo(task) ? task.id : task.parentId || task.id;
  }

  /** False only for a move the state shows to be a cycle or too deep. */
  canMoveUnderParent(taskId: string, newParentId: string): boolean {
    const entities = this._entities();
    return !entities[taskId] || !entities[newParentId]
      ? true
      : canMoveTaskUnderParent(taskId, newParentId, entities);
  }
}
