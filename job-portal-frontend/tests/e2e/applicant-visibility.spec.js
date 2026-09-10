import { expect, test } from '@playwright/test';
import { cleanupTestData, createJob, getJobCard, loginAsAdmin, loginAsApplicant } from './helpers';

const cleanupJobTitles = new Set();

test.afterEach(async ({ request }, testInfo) => {
    try {
        await cleanupTestData(request, cleanupJobTitles, testInfo);
    } finally {
        cleanupJobTitles.clear();
    }
});

test('applicant sees jobs created by admin and no longer sees them after deletion', async ({ browser }) => {
    const uniqueId = Date.now();
    const title = `e2e applicant visibility ${uniqueId}`;
    cleanupJobTitles.add(title);

    const adminContext = await browser.newContext();
    const applicantContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const applicantPage = await applicantContext.newPage();

    await loginAsAdmin(adminPage);

    await createJob(adminPage, {
        title,
        company: 'ACME Visibility',
        description: 'Created to verify applicant job-list visibility.'
    });

    await expect(adminPage.getByRole('status')).toHaveText('岗位发布成功。');
    const adminCard = getJobCard(adminPage, title);
    await expect(adminCard).toBeVisible();

    await loginAsApplicant(applicantPage);

    const applicantCard = getJobCard(applicantPage, title);
    await expect(applicantCard).toBeVisible();
    await expect(applicantCard.getByText(/公司：\s*ACME Visibility/)).toBeVisible();

    adminPage.once('dialog', async (dialog) => {
        expect(dialog.message()).toBe('确认删除这个岗位吗？此操作无法撤销。');
        await dialog.accept();
    });
    await adminCard.getByRole('button', { name: '删除', exact: true }).click();

    await expect(adminPage.getByRole('status')).toHaveText('岗位已删除。');
    await expect(getJobCard(adminPage, title)).toHaveCount(0);

    await applicantPage.reload();
    await expect(getJobCard(applicantPage, title)).toHaveCount(0);

    await adminContext.close();
    await applicantContext.close();
});

test('closed jobs disappear from the applicant dashboard and remain visible to admins', async ({ browser }) => {
    const uniqueId = Date.now();
    const title = `e2e applicant close ${uniqueId}`;
    cleanupJobTitles.add(title);

    const adminContext = await browser.newContext();
    const applicantContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const applicantPage = await applicantContext.newPage();

    await loginAsAdmin(adminPage);
    await createJob(adminPage, {
        title,
        company: 'ACME Closed',
        description: 'Created to verify applicant visibility after close.'
    });

    await expect(adminPage.getByRole('status')).toHaveText('岗位发布成功。');
    const adminCard = getJobCard(adminPage, title);
    await expect(adminCard).toBeVisible();
    await expect(adminCard.getByText(/岗位状态：\s*招聘中/)).toBeVisible();

    await loginAsApplicant(applicantPage);
    await expect(getJobCard(applicantPage, title)).toBeVisible();

    await adminCard.getByRole('button', { name: '关闭岗位', exact: true }).click();

    await expect(adminPage.getByRole('status')).toHaveText('岗位已关闭。');
    await expect(adminCard.getByText(/岗位状态：\s*已关闭/)).toBeVisible();
    await expect(adminCard.getByRole('button', { name: '重新开放', exact: true })).toBeVisible();

    await applicantPage.reload();
    await expect(getJobCard(applicantPage, title)).toHaveCount(0);

    await adminContext.close();
    await applicantContext.close();
});
