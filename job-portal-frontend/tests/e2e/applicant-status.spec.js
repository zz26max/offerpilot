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

test('applicant can withdraw and reapply after submitting an application', async ({ browser }) => {
    const uniqueId = Date.now();
    const title = `e2e applicant status ${uniqueId}`;
    cleanupJobTitles.add(title);

    const adminContext = await browser.newContext();
    const applicantContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const applicantPage = await applicantContext.newPage();

    await loginAsAdmin(adminPage);

    await createJob(adminPage, {
        title,
        company: 'ACME Status',
        description: 'Created to verify applicant application status behavior.'
    });

    await expect(adminPage.getByRole('status')).toHaveText('岗位发布成功。');
    const adminCard = getJobCard(adminPage, title);
    await expect(adminCard).toBeVisible();

    await loginAsApplicant(applicantPage);

    const applicantCard = getJobCard(applicantPage, title);
    await expect(applicantCard).toBeVisible();
    await expect(applicantCard.getByText(/投递状态：\s*未投递/)).toBeVisible();
    await applicantCard.getByRole('button', { name: '立即投递', exact: true }).click();

    await expect(applicantPage.getByText('投递成功，祝你求职顺利！', { exact: true })).toBeVisible();
    await expect(applicantCard.getByText(/投递状态：\s*已投递/)).toBeVisible();
    await expect(applicantCard.getByRole('button', { name: '撤回投递', exact: true })).toBeVisible();
    await applicantCard.getByRole('button', { name: '撤回投递', exact: true }).click();
    await expect(applicantPage.getByText('投递已撤回。你仍可以再次投递该岗位。', { exact: true })).toBeVisible();
    await expect(applicantCard.getByText(/投递状态：\s*已撤回/)).toBeVisible();
    await expect(applicantCard.getByRole('button', { name: '再次投递', exact: true })).toBeVisible();
    await applicantCard.getByRole('button', { name: '再次投递', exact: true }).click();
    await expect(applicantPage.getByText('投递成功，祝你求职顺利！', { exact: true })).toBeVisible();
    await expect(applicantCard.getByText(/投递状态：\s*已投递/)).toBeVisible();
    await expect(applicantCard.getByRole('button', { name: '撤回投递', exact: true })).toBeVisible();

    await applicantPage.reload();
    const refreshedApplicantCard = getJobCard(applicantPage, title);
    await expect(refreshedApplicantCard.getByText(/投递状态：\s*已投递/)).toBeVisible();
    await expect(refreshedApplicantCard.getByRole('button', { name: '撤回投递', exact: true })).toBeVisible();

    adminPage.once('dialog', async (dialog) => {
        expect(dialog.message()).toBe('确认删除这个岗位吗？此操作无法撤销。');
        await dialog.accept();
    });
    await adminCard.getByRole('button', { name: '删除', exact: true }).click();
    await expect(adminPage.getByRole('alert')).toHaveText('已有投递记录的岗位不能删除，请先关闭岗位。');
    await expect(adminCard).toBeVisible();

    await adminContext.close();
    await applicantContext.close();
});
