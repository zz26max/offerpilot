import { expect, test } from '@playwright/test';
import { cleanupTestData, createJob, getJobCard, loginAsAdmin } from './helpers';

const cleanupJobTitles = new Set();

test.afterEach(async ({ request }, testInfo) => {
    try {
        await cleanupTestData(request, cleanupJobTitles, testInfo);
    } finally {
        cleanupJobTitles.clear();
    }
});

test('admin sees backend validation message when description exceeds the limit', async ({ page }) => {
    const uniqueId = Date.now();
    const title = `e2e invalid job ${uniqueId}`;
    const company = 'ACME Validation';
    const description = 'x'.repeat(2001);
    cleanupJobTitles.add(title);

    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { level: 1, name: '管理后台', exact: true })).toBeVisible();

    await createJob(page, { title, company, description });

    await expect(page.getByRole('alert')).toHaveText('岗位描述不能超过 2000 个字符。');
    await expect(page.getByText('岗位发布成功。', { exact: true })).toHaveCount(0);
    await expect(getJobCard(page, title)).toHaveCount(0);
});
