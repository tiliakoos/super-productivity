import { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test.fixture';

// The innermost <task> row containing the text (ancestors also contain it and
// come first in document order).
const row = (page: Page, text: string): Locator =>
  page.locator('task').filter({ hasText: text }).last();

test.describe('Nested subtasks', () => {
  test('nests sub tasks four levels deep and keeps them after a reload', async ({
    page,
    workViewPage,
  }) => {
    await workViewPage.waitForTaskList();
    await workViewPage.addTask('Assignment 1');

    await workViewPage.addSubTask(row(page, 'Assignment 1'), 'Question 1');
    await workViewPage.addSubTask(row(page, 'Question 1'), 'Part A');
    await workViewPage.addSubTask(row(page, 'Part A'), 'Step 1');

    const root = row(page, 'Assignment 1');
    const level4 = root.locator('.sub-tasks .sub-tasks .sub-tasks task');
    await expect(level4).toHaveCount(1);
    await expect(level4).toContainText('Step 1');

    // The 4th level is the deepest: "add sub task" there adds a sibling.
    await workViewPage.addSubTask(row(page, 'Step 1'), 'Step 2');
    await expect(level4).toHaveCount(2);
    await expect(root.locator('.sub-tasks .sub-tasks .sub-tasks .sub-tasks')).toHaveCount(
      0,
    );

    await page.reload();
    await workViewPage.waitForTaskList();
    const reloadedLevel4 = row(page, 'Assignment 1').locator(
      '.sub-tasks .sub-tasks .sub-tasks task',
    );
    await expect(reloadedLevel4).toHaveCount(2);
    await expect(reloadedLevel4.nth(0)).toContainText('Step 1');
    await expect(reloadedLevel4.nth(1)).toContainText('Step 2');
  });
});
