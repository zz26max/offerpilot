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

    it('should login applicant, save token, set user details and navigate', async () => {
        axios.post.mockResolvedValueOnce({data: {token: 'jwt-123'}});
        axios.get.mockResolvedValueOnce({
            data: {roles: ['ROLE_APPLICANT'], username: 'alice@example.com', displayName: 'Alice Smith'}
        });

        const {store} = renderWithProviders(<Login/>);
        const user = userEvent.setup();

        expect(screen.getByText('可使用演示账号：admin@local.test 或 user@local.test。')).toBeInTheDocument();
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

    it('should redirect to Google OAuth endpoint when Google button is clicked', async () => {
        renderWithProviders(<Login/>);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', {name: '使用 Google 登录'}));

        expect(window.location.href).toContain('/oauth2/authorization/google');
    });
});
