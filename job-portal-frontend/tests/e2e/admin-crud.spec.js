import { expect, test } from '@playwright/test';
import {
    cleanupTestData,
    createJob,
    getJobCard,
    loginAsAdmin,
    loginAsApplicant,
    openAdminTab
} from './helpers';

const cleanupJobTitles = new Set();

test.afterEach(async ({ request }, testInfo) => {
    try {
        await cleanupTestData(request, cleanupJobTitles, testInfo);
    } finally {
        cleanupJobTitles.clear();
    }
});

test('admin can create, edit, and delete a job from the dashboard', async ({ page }) => {
    const uniqueId = Date.now();
    const createdTitle = `e2e admin job ${uniqueId}`;
    const updatedTitle = `${createdTitle} updated`;
    cleanupJobTitles.add(createdTitle);
    cleanupJobTitles.add(updatedTitle);

    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { level: 1, name: '管理后台', exact: true })).toBeVisible();

    await createJob(page, {
        title: createdTitle,
        company: 'ACME E2E',
        description: 'Created from the Playwright admin CRUD smoke test.'
    });

    await expect(page.getByRole('status')).toHaveText('岗位发布成功。');
    const createdCard = getJobCard(page, createdTitle);
    await expect(createdCard).toBeVisible();

    await createdCard.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByRole('heading', { name: '编辑岗位', exact: true })).toBeVisible();

    await page.getByLabel('岗位名称').fill(updatedTitle);
    await page.getByLabel('岗位描述').fill('Updated from the Playwright admin CRUD smoke test.');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();

    await expect(page.getByRole('status')).toHaveText('岗位信息已更新。');
    const updatedCard = getJobCard(page, updatedTitle);
    await expect(updatedCard).toBeVisible();

    page.once('dialog', async (dialog) => {
        expect(dialog.message()).toBe('确认删除这个岗位吗？此操作无法撤销。');
        await dialog.accept();
    });
    await updatedCard.getByRole('button', { name: '删除', exact: true }).click();

    await expect(page.getByRole('status')).toHaveText('岗位已删除。');
    await expect(getJobCard(page, updatedTitle)).toHaveCount(0);
});

test('admin returns to jobs after canceling edit mode', async ({ page }) => {
    const uniqueId = Date.now();
    const title = `e2e cancel edit ${uniqueId}`;
    cleanupJobTitles.add(title);

    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { level: 1, name: '管理后台', exact: true })).toBeVisible();

    await createJob(page, {
        title,
        company: 'ACME Cancel',
        description: 'Created to verify cancel edit navigation.'
    });

    await expect(page.getByRole('status')).toHaveText('岗位发布成功。');
    const jobCard = getJobCard(page, title);
    await expect(jobCard).toBeVisible();

    await jobCard.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByRole('tab', { name: '发布岗位', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: '取消编辑', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '取消编辑', exact: true }).click();

    await expect(page.getByRole('tab', { name: /^岗位管理 \(\d+\)$/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: '取消编辑', exact: true })).toHaveCount(0);
    await expect(getJobCard(page, title)).toBeVisible();

    page.once('dialog', async (dialog) => {
        expect(dialog.message()).toBe('确认删除这个岗位吗？此操作无法撤销。');
        await dialog.accept();
    });
    await getJobCard(page, title).getByRole('button', { name: '删除', exact: true }).click();

    await expect(page.getByRole('status')).toHaveText('岗位已删除。');
    await expect(getJobCard(page, title)).toHaveCount(0);
});

test('admin can review an applicant application from the dashboard', async ({ browser }) => {
    const uniqueId = Date.now();
    const title = `e2e admin review ${uniqueId}`;
    cleanupJobTitles.add(title);

    const adminContext = await browser.newContext();
    const applicantContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const applicantPage = await applicantContext.newPage();

    await loginAsAdmin(adminPage);

    await createJob(adminPage, {
        title,
        company: 'ACME Review',
        description: 'Created to verify admin application review.'
    });

    await expect(adminPage.getByRole('status')).toHaveText('岗位发布成功。');

    await loginAsApplicant(applicantPage);
    const applicantCard = getJobCard(applicantPage, title);
    await expect(applicantCard).toBeVisible();
    await applicantCard.getByRole('button', { name: '立即投递', exact: true }).click();
    await expect(applicantPage.getByText('投递成功，祝你求职顺利！', { exact: true })).toBeVisible();

    await adminPage.reload();
    const adminCard = getJobCard(adminPage, title);
    await expect(adminCard.getByText(/投递人数：\s*1/)).toBeVisible();

    await openAdminTab(adminPage, '投递管理');
    const applicationSection = adminPage.locator('.application-card')
        .filter({ hasText: '求职者：user' })
        .filter({ hasText: title })
        .first();
    await expect(applicationSection).toBeVisible();
    await applicationSection.getByLabel('调整状态').selectOption('REVIEWING');
    await applicationSection.getByRole('button', { name: '保存', exact: true }).click();

    await expect(adminPage.getByRole('status')).toHaveText('投递状态已更新。');
    await expect(applicationSection.getByText(/当前状态：\s*筛选中/)).toBeVisible();

    await applicantPage.reload();
    const refreshedApplicantCard = getJobCard(applicantPage, title);
    await expect(refreshedApplicantCard.getByText(/投递状态：\s*筛选中/)).toBeVisible();
    await expect(refreshedApplicantCard.getByText('招聘方正在筛选你的投递。', { exact: true })).toBeVisible();

    await adminContext.close();
    await applicantContext.close();
});

test('admin overview and application timestamps are visible during review flow', async ({ browser }) => {
    const uniqueId = Date.now();
    const title = `e2e overview timestamps ${uniqueId}`;
    cleanupJobTitles.add(title);

    const adminContext = await browser.newContext();
    const applicantContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const applicantPage = await applicantContext.newPage();

    await loginAsAdmin(adminPage);

    const overview = adminPage.getByLabel('管理概览');
    await expect(overview.getByText('岗位总数', { exact: true })).toBeVisible();
    await expect(overview.getByText('招聘中', { exact: true })).toBeVisible();
    await expect(overview.getByText('已关闭', { exact: true })).toBeVisible();
    await expect(overview.getByText('投递记录', { exact: true })).toBeVisible();

    await createJob(adminPage, {
        title,
        company: 'ACME Overview',
        description: 'Created to verify overview cards and application timestamps.'
    });

    await expect(adminPage.getByRole('status')).toHaveText('岗位发布成功。');

    await loginAsApplicant(applicantPage);
    const applicantCard = getJobCard(applicantPage, title);
    await expect(applicantCard).toBeVisible();
    await applicantCard.getByRole('button', { name: '立即投递', exact: true }).click();
    await expect(applicantPage.getByText('投递成功，祝你求职顺利！', { exact: true })).toBeVisible();
    await expect(applicantCard.getByText(/投递时间：/)).toBeVisible();
    await expect(applicantCard.getByText('简历已投递，等待招聘方处理。', { exact: true })).toBeVisible();

    await adminPage.reload();
    await openAdminTab(adminPage, '投递管理');
    const applicationSection = adminPage.locator('.application-card')
        .filter({ hasText: '求职者：user' })
        .filter({ hasText: title })
        .first();
    await expect(applicationSection).toBeVisible();
    await expect(applicationSection.getByText(/投递时间：/)).toBeVisible();

    await applicationSection.getByLabel('调整状态').selectOption('REVIEWING');
    await applicationSection.getByRole('button', { name: '保存', exact: true }).click();

    await expect(adminPage.getByRole('status')).toHaveText('投递状态已更新。');
    await expect(applicationSection.getByText(/当前状态：\s*筛选中/)).toBeVisible();
    await expect(applicationSection.getByText(/更新时间：/)).toBeVisible();

    await applicantPage.reload();
    const refreshedApplicantCard = getJobCard(applicantPage, title);
    await expect(refreshedApplicantCard.getByText(/投递状态：\s*筛选中/)).toBeVisible();
    await expect(refreshedApplicantCard.getByText(/投递时间：/)).toBeVisible();
    await expect(refreshedApplicantCard.getByText(/更新时间：/)).toBeVisible();

    await adminContext.close();
    await applicantContext.close();
});
