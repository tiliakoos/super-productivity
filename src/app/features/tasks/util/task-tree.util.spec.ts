import {
  canMoveTaskUnderParent,
  canTaskHaveSubTasks,
  getAncestorIds,
  getDescendantIds,
  getSubTreeHeight,
  getTaskDepth,
  TaskTreeLookup,
} from './task-tree.util';

// root -> q1 -> partA -> step1 ; root -> q2 ; other (top level)
const entities: TaskTreeLookup = {
  root: { id: 'root', subTaskIds: ['q1', 'q2'] },
  q1: { id: 'q1', parentId: 'root', subTaskIds: ['partA'] },
  q2: { id: 'q2', parentId: 'root', subTaskIds: [] },
  partA: { id: 'partA', parentId: 'q1', subTaskIds: ['step1'] },
  step1: { id: 'step1', parentId: 'partA', subTaskIds: [] },
  other: { id: 'other', subTaskIds: [] },
};

describe('task-tree.util', () => {
  it('lists ancestors nearest first', () => {
    expect(getAncestorIds('step1', entities)).toEqual(['partA', 'q1', 'root']);
    expect(getAncestorIds('root', entities)).toEqual([]);
  });

  it('computes depth', () => {
    expect(getTaskDepth('root', entities)).toBe(0);
    expect(getTaskDepth('step1', entities)).toBe(3);
  });

  it('lists all descendants', () => {
    expect(getDescendantIds('root', entities)).toEqual(['q1', 'partA', 'step1', 'q2']);
    expect(getDescendantIds('step1', entities)).toEqual([]);
  });

  it('computes sub tree height', () => {
    expect(getSubTreeHeight('root', entities)).toBe(3);
    expect(getSubTreeHeight('q2', entities)).toBe(0);
  });

  it('allows sub tasks up to four levels', () => {
    expect(canTaskHaveSubTasks('partA', entities)).toBe(true);
    expect(canTaskHaveSubTasks('step1', entities)).toBe(false);
  });

  it('refuses moves that create cycles or exceed the max depth', () => {
    expect(canMoveTaskUnderParent('q1', 'step1', entities)).toBe(false);
    expect(canMoveTaskUnderParent('q1', 'q2', entities)).toBe(false);
    expect(canMoveTaskUnderParent('partA', 'q2', entities)).toBe(true);
    expect(canMoveTaskUnderParent('other', 'partA', entities)).toBe(true);
    expect(canMoveTaskUnderParent('other', 'step1', entities)).toBe(false);
  });

  it('survives cyclic data', () => {
    const cyclic: TaskTreeLookup = {
      a: { id: 'a', parentId: 'b', subTaskIds: ['b'] },
      b: { id: 'b', parentId: 'a', subTaskIds: ['a'] },
    };
    expect(getAncestorIds('a', cyclic)).toEqual(['b']);
    expect(getDescendantIds('a', cyclic)).toEqual(['b']);
    expect(getSubTreeHeight('a', cyclic)).toBe(2);
  });
});
