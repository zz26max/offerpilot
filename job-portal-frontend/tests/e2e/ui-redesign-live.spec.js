import {expect, test} from '@playwright/test';
import {Buffer} from 'node:buffer';
import {mkdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {cleanupTestData, createJob, getJobCard, loginAsAdmin, openAdminTab} from './helpers';

const api = 'http://localhost:8080';
const screenshots = fileURLToPath(new URL('../../../docs/ui-redesign/screenshots/', import.meta.url));

test('real registration, resume processing, applications and admin controls work together', async ({browser, request}, testInfo) => {
    test.setTimeout(180_000);
    const marker = Date.now();
    const email = `ui-verification-${marker}@local.test`;
    const password = 'verification123';
    const title = `UI 验证岗位 ${marker}`;
    const editedTitle = `${title} · 已更新`;
    const cleanupTitles = new Set([title, editedTitle]);
    let adminHeaders;
    let testUserId;
    const applicantContext = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
    const adminContext = await browser.newContext({viewport: {width: 1440, height: 900}});
    const applicant = await applicantContext.newPage();
    const admin = await adminContext.newPage();
    try {
        await applicant.goto('/register');
        await applicant.getByLabel('姓名', {exact: true}).fill(`界面验证 ${marker}`);
        await applicant.getByLabel('邮箱', {exact: true}).fill(email);
        await applicant.getByLabel('密码', {exact: true}).fill(password);
        await applicant.getByLabel('确认密码', {exact: true}).fill('different-password');
        await applicant.getByRole('button', {name: /^(注册账号|注册)$/}).click();
        await expect(applicant.getByRole('alert')).toContainText('两次输入的密码不一致');
        await applicant.getByLabel('确认密码', {exact: true}).fill(password);
        await applicant.getByRole('button', {name: /^(注册账号|注册)$/}).click();
        await expect(applicant).toHaveURL(/\/$/);
        await expect(applicant.getByRole('status')).toContainText('注册成功');
        await applicant.getByLabel('邮箱', {exact: true}).fill(email);
        await applicant.getByLabel('密码', {exact: true}).fill(password);
        await applicant.getByRole('button', {name: '登录', exact: true}).click();
        await expect(applicant).toHaveURL(/\/applicant-dashboard$/);
        await expect(applicant.locator('.job-card').first()).toBeVisible();

        const authentication = await request.post(`${api}/api/auth/login`, {
            data: {}, headers: {Authorization: `Basic ${Buffer.from('admin@local.test:admin123').toString('base64')}`}
        });
        expect(authentication.ok()).toBe(true);
        adminHeaders = {Authorization: `Bearer ${(await authentication.json()).token}`};
        const users = await request.get(`${api}/api/users/admin`, {headers: adminHeaders});
        expect(users.ok()).toBe(true);
        testUserId = (await users.json()).find((user) => user.email === email)?.id;
        expect(testUserId).toBeTruthy();

        await loginAsAdmin(admin);
        await createJob(admin, {title, company: '界面联调验证', description: 'Java Spring Boot MySQL Redis Docker React Git Maven JUnit'});
        await expect(admin.getByRole('status')).toHaveText('岗位发布成功。');
        await getJobCard(admin, title).getByRole('button', {name: '编辑', exact: true}).click();
        await admin.getByLabel('岗位名称', {exact: true}).fill(editedTitle);
        await admin.getByRole('button', {name: '保存修改', exact: true}).click();
        await expect(getJobCard(admin, editedTitle)).toBeVisible();
        await getJobCard(admin, editedTitle).getByRole('button', {name: '关闭岗位', exact: true}).click();
        await expect(getJobCard(admin, editedTitle).getByRole('button', {name: '重新开放', exact: true})).toBeVisible();
        await getJobCard(admin, editedTitle).getByRole('button', {name: '重新开放', exact: true}).click();
        await expect(getJobCard(admin, editedTitle).getByRole('button', {name: '关闭岗位', exact: true})).toBeVisible();

        await applicant.reload();
        const job = getJobCard(applicant, editedTitle);
        await job.getByRole('button', {name: '立即投递', exact: true}).click();
        await expect(job.locator('.status-tag')).toContainText('已投递');
        await job.getByRole('button', {name: '撤回投递', exact: true}).click();
        await expect(job.locator('.status-tag')).toContainText('已撤回');
        await job.getByRole('button', {name: '再次投递', exact: true}).click();
        await expect(job.locator('.status-tag')).toContainText('已投递');

        await applicant.getByRole('tab', {name: '我的简历', exact: true}).click();
        await applicant.getByLabel('选择简历文件', {exact: true}).setInputFiles({
            name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not a resume')
        });
        await expect(applicant.getByRole('alert')).toContainText('仅支持 PDF 或 DOCX');
        await mkdir(screenshots, {recursive: true});
        for (const extension of ['pdf', 'docx']) {
            const path = fileURLToPath(new URL(`../fixtures/verification-resume.${extension}`, import.meta.url));
            const name = `verification-resume.${extension}`;
            await applicant.getByLabel('选择简历文件', {exact: true}).setInputFiles(path);
            const uploadResponse = applicant.waitForResponse((response) =>
                response.url() === `${api}/api/resumes` && response.request().method() === 'POST'
            );
            await applicant.getByRole('button', {name: '上传简历', exact: true}).click();
            const uploaded = await uploadResponse;
            expect(uploaded.status()).toBe(201);
            expect((await uploaded.json()).parseStatus).toBe('QUEUED');
            const record = applicant.locator('.resume-record').filter({has: applicant.getByRole('heading', {name, exact: true})});
            // Waiting on the UI verifies the existing 2-second polling, without manual refresh.
            await expect(record.locator('.resume-status')).toHaveText('解析完成', {timeout: 60_000});
            await record.getByRole('button', {name: '查看解析文本', exact: true}).click();
            await expect(record.locator('pre')).toContainText('Java Spring Boot MySQL');
            await record.getByRole('button', {name: '查看岗位匹配', exact: true}).click();
            await expect(record.locator('.resume-match-content')).toContainText('不代表招聘结论或 AI 评估');
            const match = record.locator('.resume-match-row').filter({has: applicant.getByRole('heading', {name: editedTitle, exact: true})});
            await expect(match.locator('.resume-match-score')).toHaveText('100%');
            const downloadPromise = applicant.waitForEvent('download');
            await record.getByRole('button', {name: '下载原文件', exact: true}).click();
            const download = await downloadPromise;
            expect(download.suggestedFilename()).toBe(name);
            expect(await download.failure()).toBeNull();
            expect(await readFile(await download.path())).toEqual(await readFile(path));
            if (extension === 'docx') {
                for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
                    await applicant.setViewportSize(viewport);
                    await record.scrollIntoViewIfNeeded();
                    await applicant.screenshot({path: `${screenshots}/resume-details-${viewport.width}x${viewport.height}.png`});
                    await applicant.screenshot({path: `${screenshots}/resume-details-${viewport.width}-full.png`, fullPage: true});
                }
                await applicant.setViewportSize({width: 1440, height: 900});
            }
        }

        for (const [status, label] of [['REVIEWING', '筛选中'], ['ACCEPTED', '已录用'], ['REJECTED', '未通过']]) {
            await admin.reload();
            await openAdminTab(admin, '投递管理');
            await admin.getByLabel('投递状态', {exact: true}).selectOption('ALL');
            await admin.getByLabel('搜索投递记录', {exact: true}).fill(editedTitle);
            const group = admin.getByRole('button', {name: /^展开/});
            if (await group.isVisible()) await group.click();
            const record = admin.locator('.application-card').filter({hasText: editedTitle});
            await expect(record).toBeVisible();
            await record.getByLabel('调整状态', {exact: true}).selectOption(status);
            await record.getByRole('button', {name: '保存', exact: true}).click();
            await expect(admin.getByRole('status')).toHaveText('投递状态已更新。');
            await applicant.reload();
            const card = getJobCard(applicant, editedTitle);
            await expect(card.getByRole('button', {name: label, exact: true})).toHaveCount(0);
            await expect(card.locator('.status-tag')).toContainText(label);
            await expect(card.getByText('更新时间：', {exact: true})).toBeVisible();
        }

        await openAdminTab(admin, '用户管理');
        await admin.getByLabel('搜索用户', {exact: true}).fill(email);
        const user = admin.locator('.user-card').filter({hasText: email});
        await expect(user).toBeVisible();
        await user.getByRole('button', {name: '停用账号', exact: true}).click();
        await expect(admin.getByRole('dialog')).toBeVisible();
        await admin.getByRole('button', {name: '取消', exact: true}).click();
        await expect(admin.getByRole('dialog')).toHaveCount(0);
        await expect(user.locator('.status-tag')).toContainText('已启用');
        await user.getByRole('button', {name: '停用账号', exact: true}).click();
        await admin.getByRole('button', {name: '确认停用', exact: true}).click();
        await expect(user.locator('.status-tag')).toContainText('已停用');
        await applicant.reload();
        await expect(applicant).toHaveURL(/\/$/);
        await applicant.getByLabel('邮箱', {exact: true}).fill(email);
        await applicant.getByLabel('密码', {exact: true}).fill(password);
        await applicant.getByRole('button', {name: '登录', exact: true}).click();
        await expect(applicant.getByRole('alert')).toContainText('账号已停用');
        await user.getByRole('button', {name: '启用账号', exact: true}).click();
        await expect(user.locator('.status-tag')).toContainText('已启用');
        await applicant.getByRole('button', {name: '登录', exact: true}).click();
        await expect(applicant).toHaveURL(/\/applicant-dashboard$/);
        await applicant.getByRole('button', {name: '用户菜单', exact: true}).click();
        await applicant.getByRole('button', {name: '退出登录', exact: true}).click();
        await expect(applicant).toHaveURL(/\/$/);
    } finally {
        // Uploaded resumes and users have no deletion API. Retain only this disabled test account.
        if (adminHeaders && testUserId) {
            const disabled = await request.put(`${api}/api/users/admin/applicants/${testUserId}/enabled`, {
                headers: adminHeaders, data: {enabled: false}
            });
            expect(disabled.ok()).toBe(true);
        }
        await cleanupTestData(request, cleanupTitles, testInfo);
        await applicantContext.close();
        await adminContext.close();
    }
});
