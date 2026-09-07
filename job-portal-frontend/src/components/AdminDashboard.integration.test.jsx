import {screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {http, HttpResponse} from 'msw';
import AdminDashboard from './AdminDashboard';
import {renderWithProviders} from '../test/test-utils';
import {server} from '../test/mswServer';

vi.mock('./Navbar', () => ({
    default: () => <div data-testid="navbar-mock">Navbar</div>
}));

const api = 'http://localhost:8080';
const byTextContent = (text) => (_, element) => element?.textContent === text;

describe('AdminDashboard integration', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
        localStorage.setItem('token', 'jwt-admin');
    });

    it('loads admin jobs and applications from real network handlers', async () => {
        server.use(
            http.get(`${api}/api/jobs/admin`, () => HttpResponse.json([
                {
                    id: 1,
                    title: 'Platform Engineer',
                    description: 'Own internal tooling',
                    company: 'OpenAI',
                    createdAt: '2026-05-26T10:00:00Z',
                    status: 'OPEN'
                }
            ])),
            http.get(`${api}/api/applications`, () => HttpResponse.json([
                {
                    id: 10,
                    status: 'APPLIED',
                    createdAt: '2026-05-26T11:00:00Z',
                    updatedAt: '2026-05-26T11:00:00Z',
                    user: {name: 'Maya Patel'},
                    job: {id: 1, title: 'Platform Engineer'}
                }
            ])),
            http.get(`${api}/api/users/admin`, () => HttpResponse.json([
                {
                    id: 1,
                    name: 'admin',
                    email: 'admin@local.test',
                    role: 'ADMIN',
                    enabled: true
                },
                {
                    id: 2,
                    name: 'user',
                    email: 'user@local.test',
                    role: 'APPLICANT',
                    enabled: true
                }
            ]))
        );

        renderWithProviders(<AdminDashboard/>);

        await waitFor(() => expect(screen.getByText(byTextContent('Platform Engineer'))).toBeInTheDocument());
        expect(screen.getByRole('tab', {name: /^岗位管理 \(\d+\)$/})).toHaveAttribute('aria-selected', 'true');
        const summary = screen.getByLabelText('管理概览');
        expect(within(summary).getByText('岗位总数').closest('.admin-stat-pill')).toHaveTextContent('1');
        expect(within(summary).getByText('投递记录').closest('.admin-stat-pill')).toHaveTextContent('1');
        expect(screen.getByLabelText('岗位状态图例')).toHaveTextContent('招聘中');
        expect(screen.getByLabelText('岗位状态图例')).toHaveTextContent('已关闭');
        expect(screen.getByText('招聘中：1 ｜ 已关闭：0')).toBeInTheDocument();
        expect(screen.getByText('已投递: 1 ｜ 筛选中: 0 ｜ 已录用: 0 ｜ 未通过: 0 ｜ 已撤回: 0')).toBeInTheDocument();
        expect(screen.getByText(byTextContent('投递人数：1'))).toBeInTheDocument();
        expect(screen.getByRole('tab', {name: /^用户管理 \(\d+\)$/})).toBeInTheDocument();
    });

    it('preserves timestamps when the application status update response is partial', async () => {
        server.use(
            http.get(`${api}/api/jobs/admin`, () => HttpResponse.json([
                {
                    id: 1,
                    title: 'Platform Engineer',
                    description: 'Own internal tooling',
                    company: 'OpenAI',
                    createdAt: '2026-05-26T10:00:00Z',
                    status: 'OPEN'
                }
            ])),
            http.get(`${api}/api/applications`, () => HttpResponse.json([
                {
                    id: 10,
                    status: 'APPLIED',
                    createdAt: '2026-05-26T11:00:00Z',
                    updatedAt: '2026-05-26T11:00:00Z',
                    user: {name: 'Maya Patel'},
                    job: {id: 1, title: 'Platform Engineer'}
                }
            ])),
            http.get(`${api}/api/users/admin`, () => HttpResponse.json([
                {
                    id: 1,
                    name: 'admin',
                    email: 'admin@local.test',
                    role: 'ADMIN',
                    enabled: true
                }
            ])),
            http.put(`${api}/api/applications/10`, async () => HttpResponse.json({
                id: 10,
                status: 'REVIEWING',
                updatedAt: '2026-05-26T12:30:00Z',
                user: {name: 'Maya Patel'},
                job: {id: 1, title: 'Platform Engineer'}
            }))
        );

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await user.click(screen.getByRole('tab', {name: /^投递管理 \(\d+\)$/}));
        await waitFor(() => expect(screen.getByLabelText('调整状态')).toBeInTheDocument());

        const applicationCard = screen.getByText(byTextContent('求职者：Maya Patel')).closest('.application-card');
        expect(within(applicationCard).getByText(/投递时间：/)).toBeInTheDocument();
        expect(within(applicationCard).queryByText(/更新时间：/)).not.toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText('调整状态'), 'REVIEWING');
        await user.click(screen.getByRole('button', {name: '保存'}));

        expect(await screen.findByText('投递状态已更新。')).toBeInTheDocument();
        const updatedApplicationCard = screen.getByText(byTextContent('求职者：Maya Patel')).closest('.application-card');
        expect(within(updatedApplicationCard).getByText(byTextContent('当前状态：筛选中'))).toBeInTheDocument();
        expect(within(updatedApplicationCard).getByText(/投递时间：/)).toBeInTheDocument();
        expect(within(updatedApplicationCard).getByText(/更新时间：/)).toBeInTheDocument();
    });

    it('disables applicant users through the admin users network flow', async () => {
        const applicantUser = {
            id: 20,
            name: 'Sofia Ribeiro',
            email: 'sofia.ribeiro@example.com',
            role: 'APPLICANT',
            enabled: true
        };
        const disabledUser = {
            ...applicantUser,
            enabled: false
        };

        server.use(
            http.get(`${api}/api/jobs/admin`, () => HttpResponse.json([])),
            http.get(`${api}/api/applications`, () => HttpResponse.json([])),
            http.get(`${api}/api/users/admin`, () => HttpResponse.json([
                {
                    id: 1,
                    name: 'admin',
                    email: 'admin@local.test',
                    role: 'ADMIN',
                    enabled: true
                },
                applicantUser
            ])),
            http.put(`${api}/api/users/admin/applicants/20/enabled`, async ({request}) => {
                const body = await request.json();

                if (body.enabled !== false) {
                    return HttpResponse.json({message: 'Unexpected enabled payload'}, {status: 400});
                }

                return HttpResponse.json(disabledUser);
            })
        );

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await user.click(await screen.findByRole('tab', {name: /^用户管理 \(\d+\)$/}));
        const userCard = screen.getByText('Sofia Ribeiro').closest('.user-card');
        expect(within(userCard).getByText('邮箱：')).toBeInTheDocument();
        expect(within(userCard).getByText(/sofia\.ribeiro@example\.com/)).toBeInTheDocument();
        expect(within(userCard).getByText('账号状态：')).toBeInTheDocument();
        expect(within(userCard).getByText(/已启用/)).toBeInTheDocument();

        await user.click(within(userCard).getByRole('button', {name: '停用账号'}));

        const dialog = screen.getByRole('dialog', {name: '确认停用 Sofia Ribeiro？'});
        expect(within(dialog).getByText('停用后，该用户将立即退出登录，且无法再次登录。')).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', {name: '确认停用'}));
        expect(await screen.findByText('Sofia Ribeiro 的账号已停用。')).toBeInTheDocument();
        expect(screen.getByRole('tab', {name: '用户管理 (2)'})).toBeInTheDocument();
        const updatedUserCard = screen.getByText('Sofia Ribeiro').closest('.user-card');
        expect(within(updatedUserCard).getByText(/已停用/)).toBeInTheDocument();
        expect(within(updatedUserCard).getByRole('button', {name: '启用账号'})).toBeInTheDocument();
    });
});
