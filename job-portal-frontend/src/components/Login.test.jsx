import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Login from './Login';
import {renderWithProviders} from '../test/test-utils';

const mockNavigate = vi.fn();

vi.mock('axios');
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate
    };
});

describe('Login', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('should login applicant, save token, set user details and navigate', async () => {
        axios.post.mockResolvedValueOnce({data: {token: 'jwt-123'}});
        axios.get.mockResolvedValueOnce({
            data: {roles: ['ROLE_APPLICANT'], username: 'alice@example.com', displayName: 'Alice Smith'}
        });

        const {store} = renderWithProviders(<Login/>);
        const user = userEvent.setup();

        expect(screen.queryByText('可使用演示账号：admin@local.test 或 user@local.test。')).not.toBeInTheDocument();
        expect(screen.getByRole('link', {name: '立即注册'})).toHaveAttribute('href', '/register');

        await user.type(screen.getByLabelText('邮箱'), 'alice@example.com');
        await user.type(screen.getByLabelText('密码'), 'secret');
        await user.click(screen.getByRole('button', {name: '登录'}));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                'http://localhost:8080/api/auth/login',
                {},
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: expect.stringContaining('Basic ')
                    })
                })
            )
        );

        expect(localStorage.getItem('token')).toBe('jwt-123');
        expect(store.getState().user).toEqual({
            username: 'alice@example.com',
            displayName: 'Alice Smith',
            role: 'ROLE_APPLICANT'
        });
        expect(mockNavigate).toHaveBeenCalledWith('/applicant-dashboard');
    });

    it('should show an inline error on invalid credentials', async () => {
        axios.post.mockRejectedValueOnce({
            response: {
                status: 401,
                data: {
                    message: 'Invalid email or password.'
                }
            }
        });

        renderWithProviders(<Login/>);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('邮箱'), 'alice@example.com');
        await user.type(screen.getByLabelText('密码'), 'bad');
        await user.click(screen.getByRole('button', {name: '登录'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('邮箱或密码错误。');
    });

    it('should show an inline error when the account is disabled', async () => {
        axios.post.mockRejectedValueOnce({
            response: {
                status: 401,
                data: {
                    message: 'Your account is disabled. Please contact an administrator.'
                }
            }
        });

        renderWithProviders(<Login/>);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('邮箱'), 'alice@example.com');
        await user.type(screen.getByLabelText('密码'), 'secret');
        await user.click(screen.getByRole('button', {name: '登录'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('账号已停用，请联系管理员。');
    });

    it('should show a session message from navigation state', async () => {
        renderWithProviders(<Login/>, {
            route: '/',
            initialEntries: [{
                pathname: '/',
                state: {
                    sessionMessage: '账号已停用，请联系管理员。'
                }
            }]
        });

        expect(screen.getByRole('status')).toHaveTextContent('账号已停用，请联系管理员。');
    });


    it('should show an inline error when the login request fails with a server error', async () => {
        axios.post.mockRejectedValueOnce({
            response: {
                status: 500,
                data: {
                    message: 'Internal Server Error'
                }
            }
        });

        const {store} = renderWithProviders(<Login/>);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('邮箱'), 'alice@example.com');
        await user.type(screen.getByLabelText('密码'), 'secret');
        await user.click(screen.getByRole('button', {name: '登录'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('登录失败，请检查邮箱和密码后重试。');
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(localStorage.getItem('token')).toBeNull();
        expect(store.getState().user).toEqual({
            username: '',
            displayName: '',
            role: ''
        });
    });

    it('should show an inline error when fetching user details fails after login succeeds', async () => {
        axios.post.mockResolvedValueOnce({data: {token: 'jwt-123'}});
        axios.get.mockRejectedValueOnce(new Error('network error'));

        const {store} = renderWithProviders(<Login/>);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('邮箱'), 'alice@example.com');
        await user.type(screen.getByLabelText('密码'), 'secret');
        await user.click(screen.getByRole('button', {name: '登录'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('登录失败，请检查邮箱和密码后重试。');
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(store.getState().user).toEqual({
            username: '',
            displayName: '',
            role: ''
        });
    });

    it('should show a warning when Google login returns an error', () => {
        vi.stubEnv('VITE_GOOGLE_OAUTH_ENABLED', 'true');
        renderWithProviders(<Login/>, {route: '/?oauth_error=true'});

        expect(screen.getByRole('status')).toHaveTextContent('Google 登录未完成，请重试或使用邮箱和密码登录。');
    });

    it('should disable the submit button while the login request is pending', async () => {
        let resolveLogin;
        axios.post.mockImplementationOnce(() => new Promise((resolve) => {
            resolveLogin = resolve;
        }));

        renderWithProviders(<Login/>);
        const user = userEvent.setup();
        await user.type(screen.getByLabelText('邮箱'), 'alice@example.com');
        await user.type(screen.getByLabelText('密码'), 'secret');
        await user.click(screen.getByRole('button', {name: '登录'}));

        expect(screen.getByRole('button', {name: '正在登录…'})).toBeDisabled();

        resolveLogin({data: {token: 'jwt-123'}});
        axios.get.mockResolvedValueOnce({
            data: {roles: ['ROLE_APPLICANT'], username: 'alice@example.com', displayName: 'Alice Smith'}
        });
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/applicant-dashboard'));
    });

    it('hides the Google button when OAuth is not configured', () => {
        renderWithProviders(<Login/>);

        expect(screen.queryByRole('button', {name: '使用 Google 登录'})).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: '登录'})).toBeInTheDocument();
    });

    it('should redirect to Google OAuth endpoint when Google button is clicked', async () => {
        vi.stubEnv('VITE_GOOGLE_OAUTH_ENABLED', 'true');
        renderWithProviders(<Login/>);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', {name: '使用 Google 登录'}));

        expect(window.location.href).toContain('/oauth2/authorization/google');
    });
});
