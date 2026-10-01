import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import ApplicantDashboard from './ApplicantDashboard';
import {renderWithProviders} from '../test/test-utils';

vi.mock('axios');
vi.mock('./Navbar', () => ({
    default: () => <div data-testid="navbar-mock">Navbar</div>
}));

const applicationDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
});

const byTextContent = (text) => (_, element) => element?.textContent === text;

describe('ApplicantDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem('token', 'jwt-123');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should fetch and render jobs on mount', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<ApplicantDashboard/>);

        await waitFor(() => expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/api/jobs'));
        expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/api/applications', {
            headers: {
                Authorization: 'Bearer jwt-123'
            }
        });
        expect(screen.getByText(byTextContent('Java Developer'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent('公司：ACME'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent('投递状态：未投递'))).toBeInTheDocument();
        expect(screen.getByLabelText('投递状态图例')).toHaveTextContent('未投递');
        expect(screen.getByLabelText('投递状态图例')).toHaveTextContent('已录用');
        expect(screen.getByText(byTextContent('Java Developer')).closest('.job-card')).toHaveClass('application-card-not-applied');
    });

    it('defaults to job opportunities and preserves loaded jobs across tab switches', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [{
                    id: 1,
                    title: 'Java Developer',
                    description: 'Build APIs',
                    company: 'ACME',
                    postedDate: '2026-01-01'
                }]
            })
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []});
        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        const jobsTab = screen.getByRole('tab', {name: '岗位机会'});
        const resumesTab = screen.getByRole('tab', {name: '我的简历'});
        expect(jobsTab).toHaveAttribute('aria-selected', 'true');
        expect(resumesTab).toHaveAttribute('aria-selected', 'false');
        expect(await screen.findByText(byTextContent('Java Developer'))).toBeVisible();

        await user.click(resumesTab);
        expect(resumesTab).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByRole('heading', {name: '我的简历'})).toBeInTheDocument();
        expect(screen.getByText(byTextContent('Java Developer'))).not.toBeVisible();
        expect(axios.get).toHaveBeenCalledWith('http://localhost:8080/api/resumes', {
            headers: {Authorization: 'Bearer jwt-123'}
        });

        await user.click(jobsTab);
        expect(screen.getByText(byTextContent('Java Developer'))).toBeVisible();
        expect(axios.get.mock.calls.filter(([url]) => url.endsWith('/api/jobs'))).toHaveLength(1);
        expect(axios.get.mock.calls.filter(([url]) => url.endsWith('/api/applications'))).toHaveLength(1);
    });

    it('should clear the session when application loading returns unauthorized', async () => {
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockRejectedValueOnce({
                response: {
                    status: 401,
                    data: {
                        message: 'Your account is disabled. Please contact an administrator.'
                    }
                }
            });

        const {store} = renderWithProviders(<ApplicantDashboard/>, {
            preloadedState: {
                user: {
                    username: 'alice@example.com',
                    displayName: 'Alice Smith',
                    role: 'ROLE_APPLICANT'
                }
            }
        });

        await waitFor(() => expect(localStorage.getItem('token')).toBeNull());
        expect(store.getState().user).toEqual({
            username: '',
            displayName: '',
            role: ''
        });
    });

    it('distinguishes loading, load errors, retrying, and a confirmed empty result', async () => {
        axios.get
            .mockRejectedValueOnce(new Error('network unavailable'))
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        expect(await screen.findByText('暂时无法加载岗位和投递记录，请刷新页面后重试。')).toBeInTheDocument();
        expect(screen.queryByText('暂无可投递岗位。')).not.toBeInTheDocument();

        let resolveJobs;
        let resolveApplications;
        axios.get
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveJobs = resolve;
            }))
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveApplications = resolve;
            }));

        await user.click(screen.getByRole('button', {name: '重新加载'}));

        expect(screen.getByRole('status')).toHaveTextContent('正在加载岗位与投递记录…');
        expect(screen.queryByText('暂无可投递岗位。')).not.toBeInTheDocument();

        resolveJobs({data: []});
        resolveApplications({data: []});

        expect(await screen.findByText('暂无可投递岗位。')).toBeInTheDocument();
        expect(screen.queryByText('正在加载岗位与投递记录…')).not.toBeInTheDocument();
    });

    it('should send apply request with bearer token', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});
        axios.post.mockResolvedValueOnce({
            data: {
                id: 50,
                status: 'APPLIED',
                job: {
                    id: 1
                }
            }
        });

        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', {name: '立即投递'})).toBeInTheDocument());
        await user.click(screen.getByRole('button', {name: '立即投递'}));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                'http://localhost:8080/api/applications/1',
                {},
                {
                    headers: {
                        Authorization: 'Bearer jwt-123'
                    }
                }
            )
        );
        expect(await screen.findByText('投递成功，祝你求职顺利！')).toBeInTheDocument();
        expect(screen.getByText(byTextContent('投递状态：已投递'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent('Java Developer')).closest('.job-card')).toHaveClass('application-card-applied');
        expect(screen.getByText('简历已投递，等待招聘方处理。')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '撤回投递'})).toBeInTheDocument();
    });

    it('should show inline message when apply request fails', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});
        axios.post.mockRejectedValueOnce({
            response: {
                status: 500,
                data: {
                    message: '暂时无法投递，请稍后重试。'
                }
            }
        });

        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', {name: '立即投递'})).toBeInTheDocument());
        await user.click(screen.getByRole('button', {name: '立即投递'}));

        expect(await screen.findByText('暂时无法投递，请稍后重试。')).toBeInTheDocument();
    });

    it('should disable apply and show status when an application already exists', async () => {
        const createdAt = '2026-05-26T14:43:00Z';
        const updatedAt = '2026-05-26T14:43:00Z';
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 50,
                        status: 'APPLIED',
                        createdAt,
                        updatedAt,
                        job: {
                            id: 1
                        }
                    }
                ]
            });

        renderWithProviders(<ApplicantDashboard/>);

        expect(await screen.findByText(byTextContent('投递状态：已投递'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent('Java Developer')).closest('.job-card')).toHaveClass('application-card-applied');
        expect(screen.getByText(byTextContent(`投递时间：${applicationDateTimeFormatter.format(new Date(createdAt))}`))).toBeInTheDocument();
        expect(screen.queryByText(/更新时间：/)).not.toBeInTheDocument();
        expect(screen.getByText('简历已投递，等待招聘方处理。')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '撤回投递'})).toBeInTheDocument();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('should withdraw an applied application and allow reapply after reload state changes', async () => {
        const createdAt = '2026-05-26T14:43:00Z';
        const updatedAt = '2026-05-26T15:10:00Z';
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 50,
                        status: 'APPLIED',
                        createdAt,
                        job: {
                            id: 1
                        }
                    }
                ]
            });
        axios.put.mockResolvedValueOnce({
            data: {
                id: 50,
                status: 'WITHDRAWN',
                updatedAt,
                job: {
                    id: 1
                }
            }
        });

        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', {name: '撤回投递'})).toBeInTheDocument());
        await user.click(screen.getByRole('button', {name: '撤回投递'}));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith(
                'http://localhost:8080/api/applications/50',
                null,
                {
                    params: {
                        status: 'WITHDRAWN'
                    },
                    headers: {
                        Authorization: 'Bearer jwt-123'
                    }
                }
            )
        );

        expect(await screen.findByText('投递已撤回。你仍可以再次投递该岗位。')).toBeInTheDocument();
        expect(screen.getByText(byTextContent('投递状态：已撤回'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent(`投递时间：${applicationDateTimeFormatter.format(new Date(createdAt))}`))).toBeInTheDocument();
        expect(screen.getByText(byTextContent(`更新时间：${applicationDateTimeFormatter.format(new Date(updatedAt))}`))).toBeInTheDocument();
        expect(screen.getByText('投递已撤回，你可以再次投递。')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: '再次投递'})).toBeInTheDocument();
    });

    it('should show backend message when withdraw request fails', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 50,
                        status: 'APPLIED',
                        job: {
                            id: 1
                        }
                    }
                ]
            });
        axios.put.mockRejectedValueOnce({
            response: {
                status: 403,
                data: {
                    message: 'Applicants can only set application status to WITHDRAWN'
                }
            }
        });

        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', {name: '撤回投递'})).toBeInTheDocument());
        await user.click(screen.getByRole('button', {name: '撤回投递'}));

        expect(await screen.findByText('求职者只能撤回自己的投递。')).toBeInTheDocument();
    });

    it('should show reviewing helper text for reviewed applications', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 50,
                        status: 'REVIEWING',
                        job: {
                            id: 1
                        }
                    }
                ]
            });

        renderWithProviders(<ApplicantDashboard/>);

        expect(await screen.findByText(byTextContent('投递状态：筛选中'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent('Java Developer')).closest('.job-card')).toHaveClass('application-card-reviewing');
        expect(screen.getByText('招聘方正在筛选你的投递。')).toBeInTheDocument();
    });

    it('should show accepted helper text for reviewed applications', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 50,
                        status: 'ACCEPTED',
                        job: {
                            id: 1
                        }
                    }
                ]
            });

        renderWithProviders(<ApplicantDashboard/>);

        expect(await screen.findByText(byTextContent('投递状态：已录用'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent('Java Developer')).closest('.job-card')).toHaveClass('application-card-accepted');
        expect(screen.getByText('恭喜，你已通过当前招聘流程。')).toBeInTheDocument();
    });

    it('should show rejected helper text for reviewed applications', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: 'Java Developer',
                        description: 'Build APIs',
                        company: 'ACME',
                        postedDate: '2026-01-01'
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 50,
                        status: 'REJECTED',
                        job: {
                            id: 1
                        }
                    }
                ]
            });

        renderWithProviders(<ApplicantDashboard/>);

        expect(await screen.findByText(byTextContent('投递状态：未通过'))).toBeInTheDocument();
        expect(screen.getByText(byTextContent('Java Developer')).closest('.job-card')).toHaveClass('application-card-rejected');
        expect(screen.getByText('本次投递暂未通过。')).toBeInTheDocument();
    });
});
