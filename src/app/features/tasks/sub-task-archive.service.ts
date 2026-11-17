import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { ArchiveService } from '../archive/archive.service';
import { TaskSharedActions } from '../../root-store/meta/task-shared.actions';
import { SnackService } from '../../core/snack/snack.service';
import { T } from '../../t.const';
import { selectTaskByIdWithSubTaskData } from './store/task.selectors';
import { TaskWithSubTasks } from './task.model';

/**
 * Archives the done sub tasks of a task while the task itself stays active.
 * Each archived sub task keeps its `parentId` and takes everything below it
 * along. When the parent is archived later, the archive links them back under
 * it (see `relinkArchivedSubTasks`).
 */
@Injectable({
  providedIn: 'root',
})
export class SubTaskArchiveService {
  private readonly _store = inject(Store);
  private readonly _archiveService = inject(ArchiveService);
  private readonly _snackService = inject(SnackService);
  private readonly _inFlightParentIds = new Set<string>();

  async moveDoneSubTasksToArchive(parentId: string): Promise<void> {
    if (this._inFlightParentIds.has(parentId)) {
      return;
    }
    this._inFlightParentIds.add(parentId);
    try {
      const parent = await firstValueFrom(
        this._store.select(selectTaskByIdWithSubTaskData, { id: parentId }).pipe(take(1)),
      );
      const doneSubTasks = (parent?.subTasks ?? []).filter(
        (subTask): subTask is TaskWithSubTasks => !!subTask && subTask.isDone,
      );
      if (!doneSubTasks.length) {
        return;
      }
      // Same order as TaskService.moveToArchive: persist the archive first, then
      // remove the tasks from state.
      await this._archiveService.moveTasksToArchiveAndFlushArchiveIfDue(doneSubTasks);
      this._store.dispatch(TaskSharedActions.moveToArchive({ tasks: doneSubTasks }));
      this._snackService.open({
        msg: T.F.TASK.S.MOVED_TO_ARCHIVE,
        type: 'SUCCESS',
        ico: 'done_all',
        translateParams: { nr: doneSubTasks.length },
      });
    } finally {
      this._inFlightParentIds.delete(parentId);
    }
  }
}
