import { test, expect } from '@playwright/test';

test.describe('Playwright TodoMVC Demo', () => {

  test('should be able to create and complete a todo item @smoke', async ({ page }) => {
    
    await test.step('Navigate to the web application', async () => {
      await page.goto('https://demo.playwright.dev/todomvc/');
      // Wait for network/page idle to ensure accurate timing metrics
      await page.waitForLoadState('networkidle');
    });

    await test.step('Create a new todo', async () => {
      const newTodoInput = page.getByPlaceholder('What needs to be done?');
      await newTodoInput.fill('Build PlayProm metrics');
      await newTodoInput.press('Enter');

      // Assert that the item successfully appeared in the list
      await expect(page.getByTestId('todo-title')).toHaveText(['Build PlayProm metrics']);
    });

    await test.step('Mark the newly created todo as completed', async () => {
      // Find the toggle checkbox and click it
      await page.locator('.toggle').first().check();
      
      // Assert the CSS class updated to reflect the completed state
      await expect(page.locator('.todo-list li').first()).toHaveClass(/completed/);
    });
  });

  test('should successfully clear completed todos @regression @flaky-sim', async ({ page }) => {
    await test.step('Navigate to the web application', async () => {
      await page.goto('https://demo.playwright.dev/todomvc/');
    });

    await test.step('Seed the application with multiple todos', async () => {
      const newTodoInput = page.getByPlaceholder('What needs to be done?');
      
      await newTodoInput.fill('Walk the dog');
      await newTodoInput.press('Enter');
      
      await newTodoInput.fill('Feed the cat');
      await newTodoInput.press('Enter');

      await expect(page.getByTestId('todo-title')).toHaveCount(2);
    });

    await test.step('Complete and filter elements', async () => {
      // Complete the first task
      await page.locator('.toggle').first().check();
      
      // Click the "Clear completed" button below
      await page.getByRole('button', { name: 'Clear completed' }).click();

      // Ensure the completed task disappeared and the uncompleted one remains
      await expect(page.getByTestId('todo-title')).toHaveText(['Feed the cat']);
    });
  });
});
