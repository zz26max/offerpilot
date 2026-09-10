import { expect } from '@playwright/test';

const BACKEND_API_URL = 'http://localhost:8080';
const ADMIN_CREDENTIALS = {
    email: 'admin@local.test',
    password: 'admin123'
};

export async function loginAsAdmin(page) {
    await login(page, 'admin@local.test', 'admin123', '/admin-dashboard');
}

export async function loginAsApplicant(page) {
    await login(page, 'user@local.test', 'user123', '/applicant-dashboard');
}

export async function login(page, email, password, expectedPath) {
    await page.goto(expectedPath);
    await expect(page).toHaveURL(/\/$/);

    await page.getByLabel('邮箱').fill(email);
    await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${expectedPath.replace('/', '\\/')}$`));
}

export async function openAdminTab(page, name) {
    await page.getByRole('tab', { name: new RegExp(`^${name}(?: \\(\\d+\\))?$`) }).click();
}

export async function createJob(page, { title, company, description }) {
    await openAdminTab(page, '发布岗位');
    await page.getByLabel('岗位名称').fill(title);
    await page.getByLabel('公司名称').fill(company);
    await page.getByLabel('岗位描述').fill(description);
    await page.getByRole('button', { name: '发布岗位', exact: true }).click();
}

export function getJobCard(page, title) {
    return page.locator('.job-card').filter({
        has: page.getByRole('heading', { name: title, exact: true })
    }).first();
}

async function authenticateAdmin(request) {
    const encodedCredentials = btoa(`${ADMIN_CREDENTIALS.email}:${ADMIN_CREDENTIALS.password}`);
    const response = await request.post(`${BACKEND_API_URL}/api/auth/login`, {
        data: {},
        headers: {
            Authorization: `Basic ${encodedCredentials}`
        }
    });

    if (!response.ok()) {
        throw new Error(`管理员清理登录失败（HTTP ${response.status()}）`);
    }

    const body = await response.json();
    if (!body.token) {
        throw new Error('管理员清理登录未返回 token');
    }
    return body.token;
}

async function expectSuccessfulCleanup(response, resourceLabel) {
    if (response.ok() || response.status() === 404) {
        return;
    }

    const responseBody = await response.text();
    throw new Error(`${resourceLabel}清理失败（HTTP ${response.status()}）：${responseBody}`);
}

/**
 * Deletes applications before jobs so E2E runs can be repeated against the same database.
 * Cleanup errors fail an otherwise successful test, but never replace an existing test failure.
 */
export async function cleanupTestData(request, jobTitles, testInfo) {
    const uniqueTitles = [...new Set(jobTitles)];
    if (uniqueTitles.length === 0) {
        return;
    }

    try {
        const token = await authenticateAdmin(request);
        const headers = { Authorization: `Bearer ${token}` };
        const [jobsResponse, applicationsResponse] = await Promise.all([
            request.get(`${BACKEND_API_URL}/api/jobs/admin`, { headers }),
            request.get(`${BACKEND_API_URL}/api/applications`, { headers })
        ]);

        await expectSuccessfulCleanup(jobsResponse, '岗位列表');
        await expectSuccessfulCleanup(applicationsResponse, '投递列表');

        const jobs = await jobsResponse.json();
        const applications = await applicationsResponse.json();
        const testJobs = jobs.filter((job) => uniqueTitles.includes(job.title));
        const testJobIds = new Set(testJobs.map((job) => job.id));
        const testApplications = applications.filter((application) => testJobIds.has(application.job?.id));

        for (const application of testApplications) {
            const response = await request.delete(
                `${BACKEND_API_URL}/api/applications/${application.id}`,
                { headers }
            );
            await expectSuccessfulCleanup(response, `投递 ${application.id}`);
        }

        for (const job of testJobs) {
            const response = await request.delete(`${BACKEND_API_URL}/api/jobs/${job.id}`, { headers });
            await expectSuccessfulCleanup(response, `岗位 ${job.id}`);
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (testInfo.status !== testInfo.expectedStatus) {
            testInfo.annotations.push({ type: 'cleanup', description: detail });
            console.error(`E2E 清理未完成：${detail}`);
            return;
        }
        throw error;
    }
}
