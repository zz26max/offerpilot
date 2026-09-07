import {screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {http, HttpResponse} from 'msw';
import ApplicantDashboard from './ApplicantDashboard';
import {renderWithProviders} from '../test/test-utils';
import {server} from '../test/mswServer';

vi.mock('./Navbar', () => ({
    default: () => <div data-testid="navbar-mock">Navbar</div>
}));

const api = 'http://localhost:8080';
const byTextContent = (text) => (_, element) => element?.textContent === text;

describe('ApplicantDashboard integration', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('token', 'jwt-applicant');
    });

    it('loads open jobs and the current applicant applications from real network handlers', async () => {
        server.use(
            http.get(`${api}/api/jobs`, () => HttpResponse.json([
                {
                    id: 1,
                    title: 'Platform Engineer',
                    description: 'Own internal tooling',
                    company: 'OpenAI',
                    postedDate: '2026-05-26'
                },
                {
                    id: 2,
                    title: 'Frontend Engineer',
                    description: 'Build polished UI experiences',
                    company: 'Google',
                    postedDate: '2026-05-25'
                }
            ])),
            http.get(`${api}/api/applications`, () => HttpResponse.json([
                {
                    id: 50,
                    status: 'APPLIED',
                    createdAt: '2026-05-26T11:00:00Z',
                    updatedAt: '2026-05-26T11:00:00Z',
                    job: {id: 1}
                }
            ]))
        );

        renderWithProviders(<ApplicantDashboard/>);

        await waitFor(() => expect(screen.getByText(byTextContent('Platform Engineer'))).toBeInTheDocument());
        expect(screen.getByText(byTextContent('Frontend Engineer'))).toBeInTheDocument();

        const appliedJobCard = screen.getByText(byTextContent('Platform Engineer')).closest('.job-card');
        expect(appliedJobCard).toHaveClass('application-card-applied');
        expect(within(appliedJobCard).getByText(byTextContent('投递状态：已投递'))).toBeInTheDocument();
        expect(within(appliedJobCard).getByText(/投递时间：/)).toBeInTheDocument();
        expect(within(appliedJobCard).queryByText(/更新时间：/)).not.toBeInTheDocument();
        expect(within(appliedJobCard).getByText('简历已投递，等待招聘方处理。')).toBeInTheDocument();
        expect(within(appliedJobCard).getByRole('button', {name: '撤回投递'})).toBeInTheDocument();

        const unappliedJobCard = screen.getByText(byTextContent('Frontend Engineer')).closest('.job-card');
        expect(unappliedJobCard).toHaveClass('application-card-not-applied');
        expect(within(unappliedJobCard).getByText(byTextContent('投递状态：未投递'))).toBeInTheDocument();
        expect(within(unappliedJobCard).getByText('你还没有投递这个岗位。')).toBeInTheDocument();
        expect(within(unappliedJobCard).getByRole('button', {name: '立即投递'})).toBeInTheDocument();
    });

    it('preserves timestamps when a withdraw response returns a partial payload', async () => {
        server.use(
            http.get(`${api}/api/jobs`, () => HttpResponse.json([
                {
                    id: 1,
                    title: 'Platform Engineer',
                    description: 'Own internal tooling',
                    company: 'OpenAI',
                    postedDate: '2026-05-26'
                }
            ])),
            http.get(`${api}/api/applications`, () => HttpResponse.json([
                {
                    id: 50,
                    status: 'APPLIED',
                    createdAt: '2026-05-26T11:00:00Z',
                    updatedAt: '2026-05-26T11:00:00Z',
                    job: {id: 1}
                }
            ])),
            http.put(`${api}/api/applications/50`, () => HttpResponse.json({
                id: 50,
                status: 'WITHDRAWN',
                updatedAt: '2026-05-26T12:30:00Z',
                job: {id: 1}
            }))
        );

        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', {name: '撤回投递'})).toBeInTheDocument());

        const jobCard = screen.getByText(byTextContent('Platform Engineer')).closest('.job-card');
        expect(within(jobCard).getByText(/投递时间：/)).toBeInTheDocument();
        expect(within(jobCard).queryByText(/更新时间：/)).not.toBeInTheDocument();

        await user.click(within(jobCard).getByRole('button', {name: '撤回投递'}));

        expect(await screen.findByText('投递已撤回。你仍可以再次投递该岗位。')).toBeInTheDocument();
        expect(jobCard).toHaveClass('application-card-withdrawn');
        expect(within(jobCard).getByText(byTextContent('投递状态：已撤回'))).toBeInTheDocument();
        expect(within(jobCard).getByText(/投递时间：/)).toBeInTheDocument();
        expect(within(jobCard).getByText(/更新时间：/)).toBeInTheDocument();
        expect(within(jobCard).getByText('投递已撤回，你可以再次投递。')).toBeInTheDocument();
        expect(within(jobCard).getByRole('button', {name: '再次投递'})).toBeInTheDocument();
    });

    it('preserves timestamps when a reapply response returns a partial payload', async () => {
        server.use(
            http.get(`${api}/api/jobs`, () => HttpResponse.json([
                {
                    id: 1,
                    title: 'Platform Engineer',
                    description: 'Own internal tooling',
                    company: 'OpenAI',
                    postedDate: '2026-05-26'
                }
            ])),
            http.get(`${api}/api/applications`, () => HttpResponse.json([
                {
                    id: 50,
                    status: 'WITHDRAWN',
                    createdAt: '2026-05-26T11:00:00Z',
                    updatedAt: '2026-05-26T12:30:00Z',
                    job: {id: 1}
                }
            ])),
            http.post(`${api}/api/applications/1`, () => HttpResponse.json({
                id: 50,
                status: 'APPLIED',
                updatedAt: '2026-05-26T13:45:00Z',
                job: {id: 1}
            }))
        );

        renderWithProviders(<ApplicantDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', {name: '再次投递'})).toBeInTheDocument());

        const jobCard = screen.getByText(byTextContent('Platform Engineer')).closest('.job-card');
        expect(within(jobCard).getByText(byTextContent('投递状态：已撤回'))).toBeInTheDocument();
        expect(within(jobCard).getByText(/投递时间：/)).toBeInTheDocument();
        expect(within(jobCard).getByText(/更新时间：/)).toBeInTheDocument();

        await user.click(within(jobCard).getByRole('button', {name: '再次投递'}));

        expect(await screen.findByText('投递成功，祝你求职顺利！')).toBeInTheDocument();
        expect(within(jobCard).getByText(byTextContent('投递状态：已投递'))).toBeInTheDocument();
        expect(within(jobCard).getByText(/投递时间：/)).toBeInTheDocument();
        expect(within(jobCard).getByText(/更新时间：/)).toBeInTheDocument();
        expect(within(jobCard).getByText('简历已投递，等待招聘方处理。')).toBeInTheDocument();
        expect(within(jobCard).getByRole('button', {name: '撤回投递'})).toBeInTheDocument();
    });
});
