import { createSelector } from '@ngrx/store';
import {
  selectStartOfNextDayDiffMs,
  selectTodayStr,
} from '../../root-store/app-state/app-state.selectors';
import { selectAllTasksInActiveProjects } from '../../features/tasks/store/task.selectors';
import { selectTodayTaskIds } from '../../features/work-context/store/work-context.selectors';
import { selectPlannerState } from '../../features/planner/store/planner.selectors';
import { Task } from '../../features/tasks/task.model';
import { getTaskPlannedDay } from '../../features/tasks/task-order.util';
import { getDbDateStr } from '../../util/get-db-date-str';
import { parseDbDateStr } from '../../util/parse-db-date-str';

export interface WeekDay {
  day: string;
  tasks: Task[];
}

export const selectWeekDays = createSelector(
  selectAllTasksInActiveProjects,
  selectTodayStr,
  selectStartOfNextDayDiffMs,
  selectTodayTaskIds,
  selectPlannerState,
  (tasks, todayStr, startOfNextDayDiffMs, todayTaskIds, plannerState): WeekDay[] => {
    const days: WeekDay[] = [];
    const dayByDate = new Map<string, WeekDay>();
    const cursor = parseDbDateStr(todayStr);
    cursor.setHours(12, 0, 0, 0);

    for (let index = 0; index < 7; index++) {
      const day = getDbDateStr(cursor);
      const weekDay: WeekDay = { day, tasks: [] };
      days.push(weekDay);
      dayByDate.set(day, weekDay);
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const task of tasks) {
      const day = getTaskPlannedDay(task, startOfNextDayDiffMs);
      const weekDay = day ? dayByDate.get(day) : undefined;
      if (weekDay) {
        weekDay.tasks.push(task);
      }
    }

    // Same order as the Planner: today follows the Today list, other days follow
    // their planner day; tasks the stored order does not know keep their place.
    for (const weekDay of days) {
      const storedOrder =
        weekDay.day === todayStr ? todayTaskIds : plannerState.days[weekDay.day] || [];
      if (storedOrder.length === 0) {
        continue;
      }
      const position = new Map(storedOrder.map((id, i) => [id, i]));
      weekDay.tasks.sort((a, b) => {
        const pa = position.get(a.id) ?? Infinity;
        const pb = position.get(b.id) ?? Infinity;
        return pa === pb ? 0 : pa - pb;
      });
    }

    return days;
  },
);
