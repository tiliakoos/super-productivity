import { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/test.fixture';
import { getArchiveYoungTasks } from '../../utils/audit-archive-helpers';

// The innermost <task> row containing the text (ancestors also contain it and
// come first in document order).
const row = (page: Page, text: string): Locator =>
  page.locator('task').filter({ hasText: text }).last();

const TITLES = ['Assignment 1', 'Question 1', 'Part A', 'Step 1'];

test.describe('Nested subtasks archive', () => {
  // A project list archives from its own task stream, which must carry every
  // sub task level: a level left out of the payload is deleted but never
  // written to the archive.
  test('archives every level of a four-level tree from a project list', async ({
    page,
    workViewPage,
    projectPage,
  }) => {
    await workViewPage.waitForTaskList();
    await page.locator('magic-side-nav button:has-text("Inbox")').click();
    await workViewPage.waitForTaskList();

    await workViewPage.addTask('Keep me');
    await workViewPage.addTask(TITLES[0]);
    await workViewPage.addSubTask(row(page, TITLES[0]), TITLES[1]);
    await workViewPage.addSubTask(row(page, TITLES[1]), TITLES[2]);
    await workViewPage.addSubTask(row(page, TITLES[2]), TITLES[3]);

    // the project list renders all four levels
    const level4 = row(page, TITLES[0]).locator('.sub-tasks .sub-tasks .sub-tasks task');
    await expect(level4).toHaveCount(1);
    await expect(level4).toContainText(TITLES[3]);

    // the root row's own toggle (its sub task rows carry one each)
    const rootRow = page.locator('task').filter({ hasText: TITLES[0] }).first();
    await rootRow.hover();
    await rootRow.locator('done-toggle').first().click();
    await expect(rootRow).toHaveClass(/isDone/);
    await projectPage.archiveDoneTasks();

    await expect(page.locator('task')).toHaveCount(1);
    await expect(page.locator('task')).toContainText('Keep me');
    await expect(projectPage.globalErrorAlert).not.toBeVisible();

    // addTask prefixes top-level titles per worker, so match on the ending
    const archivedLevels = async (): Promise<(string | undefined)[]> => {
      const archived = (await getArchiveYoungTasks(page)) ?? [];
      return TITLES.map((title) => archived.find((t) => t.title.endsWith(title))?.id);
    };
    await expect
      .poll(async () => (await archivedLevels()).filter((id) => !!id).length, {
        timeout: 15000,
      })
      .toBe(TITLES.length);

    // each archived level still points at its parent
    const archived = (await getArchiveYoungTasks(page)) ?? [];
    const ids = await archivedLevels();
    expect(archived.length).toBe(TITLES.length);
    for (let i = 1; i < TITLES.length; i++) {
      expect(archived.find((t) => t.id === ids[i])?.parentId).toBe(ids[i - 1]);
    }

    await page.reload();
    await workViewPage.waitForTaskList();
    await expect(page.locator('task')).toHaveCount(1);
    expect((await archivedLevels()).filter((id) => !!id).length).toBe(TITLES.length);
  });
});
