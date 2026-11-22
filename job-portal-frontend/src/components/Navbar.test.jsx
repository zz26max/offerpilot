import {screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Navbar from './Navbar';
import {renderWithProviders} from '../test/test-utils';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate
    };
});

describe('Navbar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should render display name from store', () => {
        renderWithProviders(<Navbar/>, {
            preloadedState: {
                user: {
                    username: 'alice@example.com',
                    displayName: 'Alice Smith',
                    role: 'ROLE_APPLICANT'
                }
            }
        });

        expect(screen.getByText('你好，Alice Smith')).toBeInTheDocument();
    });

    it('should fall back to username when display name is missing', () => {
        renderWithProviders(<Navbar/>, {
            preloadedState: {
                user: {
                    username: 'alice@example.com',
                    displayName: '',
                    role: 'ROLE_APPLICANT'
                }
            }
        });

        expect(screen.getByText('你好，alice@example.com')).toBeInTheDocument();
    });

    it('should clear storage, reset user, and navigate on logout', async () => {
        localStorage.setItem('token', 'jwt-123');

        const {store} = renderWithProviders(<Navbar/>, {
            preloadedState: {
                user: {
                    username: 'alice@example.com',
                    displayName: 'Alice Smith',
                    role: 'ROLE_APPLICANT'
                }
            }
        });

        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: '用户菜单'}));
        await user.click(screen.getByRole('button', {name: '退出登录'}));

        expect(localStorage.getItem('token')).toBeNull();
        await waitFor(() => {
            expect(store.getState().user).toEqual({
                username: '',
                displayName: '',
                role: ''
            });
        });
        expect(mockNavigate).toHaveBeenCalledWith('/');
    });
    it('closes the user actions on Escape and restores focus', async () => {
        renderWithProviders(<Navbar/>);
        const user = userEvent.setup();
        const trigger = screen.getByRole('button', {name: '用户菜单'});
        await user.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await user.tab();
        expect(screen.getByRole('button', {name: '退出登录'})).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(trigger).toHaveFocus();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('button', {name: '退出登录'})).not.toBeInTheDocument();
    });

    it('closes user actions when focus or a pointer moves outside', async () => {
        renderWithProviders(<><Navbar/><button>页面操作</button></>);
        const user = userEvent.setup();
        const trigger = screen.getByRole('button', {name: '用户菜单'});
        await user.click(trigger);
        await user.click(screen.getByRole('button', {name: '页面操作'}));
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await user.click(trigger);
        await user.tab();
        await user.tab();
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

});
