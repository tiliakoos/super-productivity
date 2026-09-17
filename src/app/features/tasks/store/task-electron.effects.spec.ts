import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { BehaviorSubject, Subject } from 'rxjs';
import { TaskElectronEffects } from './task-electron.effects';
import { TimeTrackingActions } from '../../time-tracking/store/time-tracking.actions';
import {
  selectIsOsProgressBarOwnedBySession,
  selectIsOverlayShown,
} from '../../focus-mode/store/focus-mode.selectors';
import { selectCurrentTask, selectTaskEntities } from './task.selectors';
import { selectTodayTaskIds } from '../../work-context/store/work-context.selectors';
import { selectAllProjects } from '../../project/store/project.selectors';
import { GlobalConfigService } from '../../config/global-config.service';
import { FocusModeService } from '../../focus-mode/focus-mode.service';
import { TaskService } from '../task.service';
import { LOCAL_ACTIONS } from '../../../util/local-actions.token';
import { DEFAULT_TASK, Task } from '../task.model';
import { DateService } from '../../../core/date/date.service';
import { NavigateToTaskService } from '../../../core-ui/navigate-to-task/navigate-to-task.service';
import { TranslateService } from '@ngx-translate/core';
import { WorkContextType } from '../../work-context/work-context.model';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { IPC } from '../../../../../electron/shared-with-frontend/ipc-events.const';

/**
 * The OS progress bar (taskbar/dock) must only ever have one writer: a timed
 * focus session publishes its own progress, and this effect has to stand down
 * for exactly as long as that is true. Gating on the focus overlay being
 * *shown* instead left both writers active whenever the overlay was hidden, so
 * the bar cycled between the two values every second (#9944).
 */
describe('TaskElectronEffects', () => {
  let effects: TaskElectronEffects;
  let actions$: Subject<any>;
  let store: MockStore;
  let setProgressBarSpy: jasmine.Spy;
  let eaOnSpy: jasmine.Spy;
  let setDoneSpy: jasmine.Spy;
  let createNewTaskWithDefaultsSpy: jasmine.Spy;
  let navigateSpy: jasmine.Spy;

  const task: Task = {
    ...DEFAULT_TASK,
    id: 'T1',
    title: 'Task',
    projectId: 'project-1',
    timeSpent: 30 * 60000,
    timeEstimate: 60 * 60000,
  };

  const addTimeSpent = (): ReturnType<typeof TimeTrackingActions.addTimeSpent> =>
    TimeTrackingActions.addTimeSpent({
      task,
      date: '2026-01-05',
      duration: 1000,
      isFromTrackingReminder: false,
    });

  beforeEach(() => {
    actions$ = new Subject<any>();
    setProgressBarSpy = jasmine.createSpy('setProgressBar');
    eaOnSpy = jasmine.createSpy('on');
    setDoneSpy = jasmine.createSpy('setDone');
    createNewTaskWithDefaultsSpy = jasmine
      .createSpy('createNewTaskWithDefaults')
      .and.returnValue(task);
    navigateSpy = jasmine.createSpy('navigate').and.resolveTo();
    (window as any).ea = {
      on: eaOnSpy,
      onSwitchTask: () => {},
      updateCurrentTask: () => {},
      updateTodayTasks: () => {},
      setProgressBar: setProgressBarSpy,
    };

    TestBed.configureTestingModule({
      providers: [
        TaskElectronEffects,
        provideMockActions(() => actions$),
        provideMockStore({
          selectors: [
            { selector: selectCurrentTask, value: task },
            { selector: selectTaskEntities, value: { T1: task } },
            { selector: selectTodayTaskIds, value: [] },
            {
              selector: selectAllProjects,
              value: [{ id: 'project-1', isArchived: false }],
            },
            { selector: selectIsOverlayShown, value: false },
            { selector: selectIsOsProgressBarOwnedBySession, value: false },
          ],
        }),
        { provide: LOCAL_ACTIONS, useValue: actions$ },
        { provide: GlobalConfigService, useValue: {} },
        {
          provide: TaskService,
          useValue: {
            setCurrentId: () => {},
            setDone: setDoneSpy,
            createNewTaskWithDefaults: createNewTaskWithDefaultsSpy,
          },
        },
        {
          provide: DateService,
          useValue: {
            todayStr: () => '2026-01-05',
            getLogicalTodayDate: () => new Date('2026-01-05'),
          },
        },
        {
          provide: NavigateToTaskService,
          useValue: { navigate: navigateSpy },
        },
        {
          provide: TranslateService,
          useValue: { instant: (key: string) => key, onLangChange: new Subject() },
        },
        {
          provide: FocusModeService,
          useValue: {
            currentSessionTime$: new BehaviorSubject(0),
            mode: () => 'Flowtime',
          },
        },
      ],
    });

    effects = TestBed.inject(TaskElectronEffects);
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch').and.callThrough();
  });

  afterEach(() => {
    store.resetSelectors();
    delete (window as any).ea;
  });

  describe('setTaskBarProgress$', () => {
    it('should publish task progress while no focus session owns the bar', () => {
      const sub = effects.setTaskBarProgress$.subscribe();
      actions$.next(addTimeSpent());
      sub.unsubscribe();

      expect(setProgressBarSpy).toHaveBeenCalledWith({
        progress: 0.5,
        progressBarMode: 'normal',
      });
    });

    it('should stand down while a timed focus session owns the bar', () => {
      store.overrideSelector(selectIsOsProgressBarOwnedBySession, true);
      store.refreshState();

      const sub = effects.setTaskBarProgress$.subscribe();
      actions$.next(addTimeSpent());
      sub.unsubscribe();

      expect(setProgressBarSpy).not.toHaveBeenCalled();
    });

    // An open-ended (Flowtime) session owns nothing, so the task progress has to
    // keep flowing even though the focus overlay may be hidden or shown.
    it('should keep publishing during an open-ended focus session', () => {
      store.overrideSelector(selectIsOverlayShown, true);
      store.overrideSelector(selectIsOsProgressBarOwnedBySession, false);
      store.refreshState();

      const sub = effects.setTaskBarProgress$.subscribe();
      actions$.next(addTimeSpent());
      sub.unsubscribe();

      expect(setProgressBarSpy).toHaveBeenCalledWith({
        progress: 0.5,
        progressBarMode: 'normal',
      });
    });
  });

  it('wires tray popover complete, open, and add IPC callbacks', () => {
    const listeners = new Map<string, (payload?: unknown) => void>();
    eaOnSpy.calls
      .allArgs()
      .forEach(([event, listener]) => listeners.set(event, listener));

    listeners.get(IPC.TRAY_POPOVER_COMPLETE)!('T1');
    listeners.get(IPC.TRAY_POPOVER_OPEN)!('T1');
    listeners.get(IPC.TRAY_POPOVER_ADD)!({
      title: '  New task  ',
      projectId: 'project-1',
    });

    expect(setDoneSpy).toHaveBeenCalledWith('T1');
    expect(navigateSpy).toHaveBeenCalledWith('T1');
    expect(createNewTaskWithDefaultsSpy).toHaveBeenCalledWith({
      title: 'New task',
      workContextType: WorkContextType.PROJECT,
      workContextId: 'project-1',
      additional: { dueDay: '2026-01-05' },
    });
    expect(store.dispatch).toHaveBeenCalledWith(
      TaskSharedActions.addTask({
        task,
        workContextId: 'project-1',
        workContextType: WorkContextType.PROJECT,
        isAddToBacklog: false,
        isAddToBottom: true,
      }),
    );
  });
});
