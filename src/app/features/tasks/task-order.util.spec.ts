import {
  buildTaskOrderIndex,
  getTaskPlannedDay,
  orderKeyForRank,
  orderRankFromKey,
  TaskOrderSource,
} from './task-order.util';

describe('task-order.util', () => {
  const src = (id: string, o: Partial<TaskOrderSource> = {}): TaskOrderSource => ({
    id,
    isDone: false,
    ...o,
  });

  describe('getTaskPlannedDay', () => {
    it('prefers dueWithTime over dueDay and applies the day offset', () => {
      // 02:00 on the 9th with a 4h offset still belongs to the 8th
      const dueWithTime = new Date(2026, 2, 9, 2).getTime();
      expect(
        getTaskPlannedDay({ dueWithTime, dueDay: '2026-03-20' }, 4 * 60 * 60 * 1000),
      ).toBe('2026-03-08');
    });

    it('falls back to dueDay and to undefined', () => {
      expect(getTaskPlannedDay({ dueDay: '2026-03-10' }, 0)).toBe('2026-03-10');
      expect(getTaskPlannedDay({ dueDay: null }, 0)).toBeUndefined();
      expect(getTaskPlannedDay({}, 0)).toBeUndefined();
    });
  });

  describe('buildTaskOrderIndex', () => {
    it('ranks undone keyed tasks per day and skips done, unkeyed and dayless tasks', () => {
      const index = buildTaskOrderIndex(
        [
          src('c', { dueDay: '2026-03-08', orderKey: 30 }),
          src('a', { dueDay: '2026-03-08', orderKey: 10 }),
          src('done', { dueDay: '2026-03-08', orderKey: 5, isDone: true }),
          src('unkeyed', { dueDay: '2026-03-08' }),
          src('dayless', { orderKey: 1 }),
          src('b', { dueDay: '2026-03-09', orderKey: 20 }),
        ],
        0,
      );

      expect(index.rankById).toEqual({ a: 1, c: 2, b: 1 });
      expect(index.keyedByDay['2026-03-08'].map((e) => e.id)).toEqual(['a', 'c']);
      expect(index.keyedByDay['2026-03-09'].map((e) => e.id)).toEqual(['b']);
    });

    it('breaks equal keys by id so ranks are deterministic', () => {
      const index = buildTaskOrderIndex(
        [
          src('z', { dueDay: '2026-03-08', orderKey: 1 }),
          src('y', { dueDay: '2026-03-08', orderKey: 1 }),
        ],
        0,
      );
      expect(index.rankById).toEqual({ y: 1, z: 2 });
    });
  });

  describe('orderKeyForRank', () => {
    it('starts at 1 when nothing else is keyed', () => {
      expect(orderKeyForRank([], 1)).toBe(1);
      expect(orderKeyForRank([], 5)).toBe(1);
    });

    it('goes before the first, after the last, or between neighbours', () => {
      expect(orderKeyForRank([10, 20, 30], 1)).toBe(9);
      expect(orderKeyForRank([10, 20, 30], 4)).toBe(31);
      expect(orderKeyForRank([10, 20, 30], 9)).toBe(31);
      expect(orderKeyForRank([10, 20, 30], 2)).toBe(15);
      expect(orderKeyForRank([10, 20, 30], 3)).toBe(25);
    });
  });

  describe('orderRankFromKey', () => {
    const ev = (key: string, init: KeyboardEventInit = {}): KeyboardEvent =>
      new KeyboardEvent('keydown', { key, ...init });

    it('maps bare digits to a rank, 0 to clear, everything else to undefined', () => {
      expect(orderRankFromKey(ev('3'))).toBe(3);
      expect(orderRankFromKey(ev('0'))).toBeNull();
      expect(orderRankFromKey(ev('d'))).toBeUndefined();
      expect(orderRankFromKey(ev('3', { ctrlKey: true }))).toBeUndefined();
      expect(orderRankFromKey(ev('3', { metaKey: true }))).toBeUndefined();
      expect(orderRankFromKey(ev('3', { altKey: true }))).toBeUndefined();
    });
  });
});
