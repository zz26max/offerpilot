import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Register from './Register';
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

describe('Register', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should register an applicant and return to login', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                id: 10,
                name: 'Rafael Costa',
                email: 'rafael@example.com',
                role: 'APPLICANT',
                enabled: true
            }
        });

        renderWithProviders(<Register/>);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('姓名'), 'Rafael Costa');
        await user.type(screen.getByLabelText('邮箱'), 'rafael@example.com');
        await user.type(screen.getByLabelText('密码'), 'applicant123');
        await user.type(screen.getByLabelText('确认密码'), 'applicant123');
        await user.click(screen.getByRole('button', {name: '注册账号'}));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                'http://localhost:8080/api/auth/register',
                {
                    name: 'Rafael Costa',
                    email: 'rafael@example.com',
                    password: 'applicant123'
                }
            )
        );
        expect(mockNavigate).toHaveBeenCalledWith('/', {
            state: {
                registrationMessage: '注册成功，请使用邮箱和密码登录。'
            }
        });
    });

    it('should block registration when passwords do not match', async () => {
        renderWithProviders(<Register/>);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('姓名'), 'Rafael Costa');
        await user.type(screen.getByLabelText('邮箱'), 'rafael@example.com');
        await user.type(screen.getByLabelText('密码'), 'applicant123');
        await user.type(screen.getByLabelText('确认密码'), 'different123');
        await user.click(screen.getByRole('button', {name: '注册账号'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('两次输入的密码不一致。');
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('should show backend error messages', async () => {
        axios.post.mockRejectedValueOnce({
            response: {
                data: {
                    message: 'User email already exists'
                }
            }
        });

        renderWithProviders(<Register/>);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('姓名'), 'Rafael Costa');
        await user.type(screen.getByLabelText('邮箱'), 'rafael@example.com');
        await user.type(screen.getByLabelText('密码'), 'applicant123');
        await user.type(screen.getByLabelText('确认密码'), 'applicant123');
        await user.click(screen.getByRole('button', {name: '注册账号'}));

        expect(await screen.findByRole('alert')).toHaveTextContent('该邮箱已注册。');
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});
