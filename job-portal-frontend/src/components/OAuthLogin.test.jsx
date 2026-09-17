import {waitFor} from '@testing-library/react';
import axios from 'axios';
import OAuthLogin from './OAuthLogin';
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

describe('OAuthLogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        window.history.pushState({}, '', '/oauthlogon');
        vi.stubGlobal('alert', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should use the application token, fetch application user details, update store and navigate', async () => {
        axios.get.mockResolvedValueOnce({
            data: {
                username: 'oauth.user@example.com',
                displayName: 'OAuth User',
                roles: ['ROLE_APPLICANT']
            }
        });
        window.history.pushState({}, '', '/oauthlogon#token=application-jwt');

        const {store} = renderWithProviders(<OAuthLogin/>);

        await waitFor(() =>
            expect(axios.get).toHaveBeenCalledWith(
                'http://localhost:8080/api/auth/details',
                {
                    headers: {
                        Authorization: 'Bearer application-jwt'
                    }
                }
            )
        );

        expect(localStorage.getItem('token')).toBe('application-jwt');
        expect(store.getState().user).toEqual({
            username: 'oauth.user@example.com',
            displayName: 'OAuth User',
            role: 'ROLE_APPLICANT'
        });
        expect(mockNavigate).toHaveBeenCalledWith('/applicant-dashboard');
    });

    it('should not call exchange endpoint when code is missing', async () => {
        renderWithProviders(<OAuthLogin/>);

        await waitFor(() => expect(axios.get).not.toHaveBeenCalled());
        expect(mockNavigate).toHaveBeenCalledWith('/');
    });
});
