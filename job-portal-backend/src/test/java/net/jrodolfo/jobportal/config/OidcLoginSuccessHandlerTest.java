package net.jrodolfo.jobportal.config;

import net.jrodolfo.jobportal.constant.AuthProvider;
import net.jrodolfo.jobportal.constant.Role;
import net.jrodolfo.jobportal.model.User;
import net.jrodolfo.jobportal.service.UserService;
import net.jrodolfo.jobportal.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OidcLoginSuccessHandlerTest {

    @Mock
    private UserService userService;

    @Mock
    private JwtUtil jwtUtil;

    @Mock
    private OidcUser oidcUser;

    @Test
    void verifiedOidcPrincipalIsExchangedForApplicationJwt() throws Exception {
        User user = new User("OAuth User", "oauth@example.com", AuthProvider.GOOGLE, Role.APPLICANT);
        when(oidcUser.getEmail()).thenReturn("oauth@example.com");
        when(oidcUser.getEmailVerified()).thenReturn(true);
        when(oidcUser.getFullName()).thenReturn("OAuth User");
        when(userService.createOrUpdateGoogleApplicant("oauth@example.com", "OAuth User")).thenReturn(user);
        when(jwtUtil.generateToken("oauth@example.com")).thenReturn("application.jwt");

        MockHttpServletResponse response = new MockHttpServletResponse();
        new OidcLoginSuccessHandler(userService, jwtUtil, "http://localhost:5173")
                .onAuthenticationSuccess(
                        new MockHttpServletRequest(),
                        response,
                        new UsernamePasswordAuthenticationToken(oidcUser, null)
                );

        assertEquals("http://localhost:5173/oauthlogon#token=application.jwt", response.getRedirectedUrl());
    }

    @Test
    void unverifiedOidcEmailDoesNotReceiveApplicationJwt() throws Exception {
        when(oidcUser.getEmail()).thenReturn("oauth@example.com");
        when(oidcUser.getEmailVerified()).thenReturn(false);
        MockHttpServletResponse response = new MockHttpServletResponse();

        new OidcLoginSuccessHandler(userService, jwtUtil, "http://localhost:5173")
                .onAuthenticationSuccess(
                        new MockHttpServletRequest(),
                        response,
                        new UsernamePasswordAuthenticationToken(oidcUser, null)
                );

        assertEquals("http://localhost:5173/?oauth_error=true", response.getRedirectedUrl());
        verify(userService, never()).createOrUpdateGoogleApplicant(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        verify(jwtUtil, never()).generateToken(org.mockito.ArgumentMatchers.any());
    }
}
