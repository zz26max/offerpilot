package net.jrodolfo.jobportal.controller;

import net.jrodolfo.jobportal.config.FailOpenCacheErrorHandler;
import net.jrodolfo.jobportal.config.JobCacheNames;
import net.jrodolfo.jobportal.observability.JobCacheMetricsBinder;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.cache.Cache;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.CacheManager;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests for API security behavior, focusing on response statuses for unauthorized and forbidden requests.
 * Ensures that the API returns appropriate HTTP status codes instead of redirecting to OAuth login pages.
 */
@SpringBootTest
@AutoConfigureMockMvc
@AutoConfigureObservability
@ActiveProfiles("test")
class ApiSecurityBehaviorTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private CacheErrorHandler cacheErrorHandler;

    @Autowired
    private CacheManager cacheManager;

    @Autowired
    private JobCacheMetricsBinder jobCacheMetricsBinder;

    @Test
    void createJobWithoutAuthenticationShouldReturnUnauthorizedInsteadOfRedirectingToOauth() throws Exception {
        mockMvc.perform(post("/api/jobs"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void createJobWithApplicantCredentialsShouldReturnForbiddenInsteadOfRedirectingToOauth() throws Exception {
        mockMvc.perform(post("/api/jobs")
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void protectedUserEndpointsShouldStillRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/users/admin"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void removedOauthHelperEndpointsAreNotPublicAndDoNotFailWithServerError() throws Exception {
        mockMvc.perform(get("/api/oauth/token"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"));
        mockMvc.perform(get("/api/oauth/user-details"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"));
        mockMvc.perform(post("/api/oauth/exchange-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("Location"));
    }

    @Test
    void cacheNoneTestContextStartsAndMetricsBinderRemainsSafe() {
        assertNotNull(cacheManager);
        assertNotNull(jobCacheMetricsBinder);
    }

    @Test
    void actuatorHealthIsPublicButPrometheusRequiresAdmin() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/actuator/prometheus"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/actuator/prometheus")
                        .with(user("user@local.test").roles("APPLICANT")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/actuator/prometheus")
                        .with(user("admin@local.test").roles("ADMIN")))
                .andExpect(status().isOk());
    }

    @Test
    void prometheusExportsFailOpenCacheCounterWithoutKeyTags() throws Exception {
        Cache cache = mock(Cache.class);
        when(cache.getName()).thenReturn(JobCacheNames.OPEN_JOBS);
        cacheErrorHandler.handleCacheGetError(new IllegalStateException("cache unavailable"), cache, "secret-key");

        mockMvc.perform(get("/actuator/prometheus")
                        .with(user("admin@local.test").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("offerpilot_cache_fail_open_errors_total")))
                .andExpect(content().string(containsString("cache=\"jobs-open\"")))
                .andExpect(content().string(containsString("operation=\"read\"")))
                .andExpect(content().string(org.hamcrest.Matchers.not(containsString("secret-key"))));
    }
}
