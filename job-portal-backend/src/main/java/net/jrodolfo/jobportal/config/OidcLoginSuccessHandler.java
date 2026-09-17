package net.jrodolfo.jobportal.config;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import net.jrodolfo.jobportal.model.User;
import net.jrodolfo.jobportal.service.UserService;
import net.jrodolfo.jobportal.util.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Converts a Spring Security-verified OIDC identity into an application JWT.
 * External ID tokens are never exposed to the frontend or accepted by the API.
 */
@Component
public class OidcLoginSuccessHandler implements AuthenticationSuccessHandler {

    private final UserService userService;
    private final JwtUtil jwtUtil;
    private final String frontendBaseUrl;

    public OidcLoginSuccessHandler(UserService userService,
                                   JwtUtil jwtUtil,
                                   @Value("${FRONTEND_BASE_URL:http://localhost:5173}") String frontendBaseUrl) {
        this.userService = userService;
        this.jwtUtil = jwtUtil;
        this.frontendBaseUrl = frontendBaseUrl;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        if (!(authentication.getPrincipal() instanceof OidcUser oidcUser)
                || oidcUser.getEmail() == null
                || !Boolean.TRUE.equals(oidcUser.getEmailVerified())) {
            response.sendRedirect(frontendBaseUrl + "/?oauth_error=true");
            return;
        }

        try {
            User user = userService.createOrUpdateGoogleApplicant(oidcUser.getEmail(), oidcUser.getFullName());
            String applicationToken = jwtUtil.generateToken(user.getEmail());
            response.sendRedirect(frontendBaseUrl + "/oauthlogon#token="
                    + URLEncoder.encode(applicationToken, StandardCharsets.UTF_8));
        } catch (RuntimeException exception) {
            response.sendRedirect(frontendBaseUrl + "/?oauth_error=true");
        }
    }
}
