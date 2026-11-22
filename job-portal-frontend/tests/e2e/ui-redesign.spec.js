import {expect, test} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loginAsAdmin, loginAsApplicant, openAdminTab} from './helpers';

const screenshots = fileURLToPath(new URL('../../../docs/ui-redesign/screenshots/', import.meta.url));
const viewports = [
    {width: 1440, height: 900},
    {width: 390, height: 844},
    {width: 1920, height: 1080}
];

async function checkLayout(page) {
    await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth <= window.innerWidth
    )).toBe(true);
    const tooSmall = await page.locator('button, input:not([type="hidden"]), select, textarea').evaluateAll((nodes) =>
        nodes.filter((node) => {
            const style = getComputedStyle(node);
            if (node.matches('input[type="file"]') && style.clip !== 'auto') {
                return false;
            }
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.height < 43.5;
        }).map((node) => node.getAttribute('aria-label') || node.textContent || node.id)
    );
    expect(tooSmall, 'Visible form controls and buttons must be at least 44px tall').toEqual([]);
    const trigger = page.locator('.resume-file-trigger');
    if (await trigger.count()) {
        const triggerHeights = await trigger.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
        expect(Math.min(...triggerHeights), 'The visible resume file trigger must be at least 44px tall').toBeGreaterThanOrEqual(43.5);
    }
}

async function capture(page, name, viewport) {
    await checkLayout(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: `${screenshots}/${name}-${viewport.width}x${viewport.height}.png`, animations: 'disabled'});
    if (viewport.width === 390) {
        await page.screenshot({path: `${screenshots}/${name}-390-full.png`, fullPage: true, animations: 'disabled'});
    }
}

test('real API pages retain their layouts at desktop, mobile and wide desktop sizes', async ({browser}) => {
    test.setTimeout(120_000);
    await mkdir(screenshots, {recursive: true});
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.goto('/register');
            await expect(page.getByRole('heading', {name: '注册求职者账号', exact: true})).toBeVisible();
            await capture(page, 'register', viewport);
            await page.goto('/');
            await expect(page.getByRole('button', {name: '登录', exact: true})).toBeVisible();
            await capture(page, 'login', viewport);
        }
        await loginAsApplicant(page);
        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            await page.getByRole('tab', {name: /^岗位机会/}).click();
            await expect(page.locator('.job-card').first()).toBeVisible();
            await expect(page.getByRole('tabpanel')).toHaveCount(1);
            await expect(page.locator('#applicant-resumes-panel')).toBeAttached();
            await capture(page, 'applicant-jobs', viewport);
            await page.getByRole('tab', {name: '我的简历', exact: true}).click();
            await expect(page.getByRole('button', {name: '刷新状态', exact: true})).toBeVisible();
            await capture(page, 'applicant-resumes', viewport);
        }
        await context.clearCookies();
        await page.evaluate(() => localStorage.clear());
        await loginAsAdmin(page);
        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            for (const [tab, name] of [
                ['岗位管理', 'admin-jobs'], ['发布岗位', 'admin-publish'],
                ['投递管理', 'admin-applications'], ['用户管理', 'admin-users']
            ]) {
                await openAdminTab(page, tab);
                if (tab === '用户管理') await page.getByLabel('搜索用户', {exact: true}).fill('@local.test');
                if (tab === '投递管理') await page.getByLabel('搜索投递记录', {exact: true}).fill('user');
                await expect(page.getByRole('tabpanel')).toHaveCount(1);
                await capture(page, name, viewport);
            }
        }
        expect(errors).toEqual([]);
    } finally {
        await context.close();
    }
});

// API-shaped fixtures are confined to this test. Delivery screenshots above use live APIs.
for (const viewport of viewports) {
    test(`all actual statuses and long content remain usable at ${viewport.width}px`, async ({browser}) => {
        const context = await browser.newContext({viewport});
        await context.addInitScript(() => localStorage.setItem('token', 'ui-fixture-only'));
        const page = await context.newPage();
        const statuses = [null, 'APPLIED', 'REVIEWING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'];
        const jobs = statuses.map((status, index) => ({
            id: 800 + index,
            title: `${index + 1} · 长岗位名称与英文 Java Spring Boot ${'工程实践'.repeat(12)}`,
            company: `用于边界验证的公司 ${'LongCompanyName'.repeat(10)}`,
            description: `${'岗位说明与技术要求。'.repeat(40)} https://example.test/${'long'.repeat(60)}`,
            ...(index ? {createdAt: '2026-11-17T02:00:00Z'} : {})
        }));
        const applications = statuses.flatMap((status, index) => status ? [{
            id: 900 + index, job: jobs[index], status,
            createdAt: '2026-11-17T03:00:00Z', updatedAt: '2026-11-17T04:00:00Z'
        }] : []);
        try {
            await context.route('**/api/auth/details', (route) => route.fulfill({json: {
                username: `${'long.email.'.repeat(15)}@example.test`,
                displayName: '', roles: ['ROLE_APPLICANT']
            }}));
            await context.route('**/api/jobs', (route) => route.fulfill({json: jobs}));
            await context.route('**/api/applications', (route) => route.fulfill({json: applications}));
            await context.route('**/api/resumes', (route) => route.fulfill({json: []}));
            await page.goto('/applicant-dashboard');
            const records = page.locator('.applicant-job-record');
            await expect(records).toHaveCount(6);
            for (const [index, label] of ['立即投递', '撤回投递', '筛选中', '已录用', '未通过', '再次投递'].entries()) {
                const record = records.nth(index);
                if ([2, 3, 4].includes(index)) {
                    await expect(record.getByRole('button', {name: label, exact: true})).toHaveCount(0);
                    await expect(record.locator('.status-tag')).toContainText(label);
                    await expect(record.locator('.applicant-job-action')).toHaveClass(/is-readonly/);
                } else {
                    await expect(record.getByRole('button', {name: label, exact: true})).toBeEnabled();
                }
            }
            await expect(records.first().getByText('发布时间：', {exact: true})).toHaveCount(0);
            await checkLayout(page);
            const tabs = page.getByRole('tab');
            await tabs.first().focus();
            await page.keyboard.press('ArrowRight');
            await expect(tabs.nth(1)).toBeFocused();
            await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
            await expect(page.getByRole('tabpanel')).toHaveCount(1);
            await checkLayout(page);
            await page.keyboard.press('ArrowLeft');
            await expect(tabs.first()).toBeFocused();
            expect(await tabs.first().evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe('none');
        } finally {
            await context.close();
        }
    });
}
