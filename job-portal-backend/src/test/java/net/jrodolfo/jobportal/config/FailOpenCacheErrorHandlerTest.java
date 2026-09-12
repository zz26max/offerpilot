package net.jrodolfo.jobportal.config;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.cache.Cache;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FailOpenCacheErrorHandlerTest {

    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private final FailOpenCacheErrorHandler handler = new FailOpenCacheErrorHandler(meterRegistry);
    private final RuntimeException failure = new RuntimeException("cache unavailable");

    @Test
    void getFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCacheGetError(failure, cache, "hidden-key"));
        assertErrorCount("read", 1.0);
    }

    @Test
    void putFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCachePutError(failure, cache, "hidden-key", "hidden-value"));
        assertErrorCount("write", 1.0);
    }

    @Test
    void evictionFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCacheEvictError(failure, cache, "hidden-key"));
        assertErrorCount("eviction", 1.0);
    }

    @Test
    void clearFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCacheClearError(failure, cache));
        assertErrorCount("clear", 1.0);
    }

    @Test
    void unknownCacheNamesUseABoundedFallbackTag() {
        Cache cache = mock(Cache.class);
        when(cache.getName()).thenReturn("tenant-secret-cache");

        handler.handleCacheGetError(failure, cache, "hidden-key");

        assertEquals(1.0, meterRegistry.get(FailOpenCacheErrorHandler.ERROR_METRIC_NAME)
                .tag("cache", "other")
                .tag("operation", "read")
                .counter()
                .count());
        assertNull(meterRegistry.find(FailOpenCacheErrorHandler.ERROR_METRIC_NAME)
                .tag("cache", "tenant-secret-cache")
                .counter());
    }

    private Cache cache() {
        Cache cache = mock(Cache.class);
        when(cache.getName()).thenReturn(JobCacheNames.OPEN_JOBS);
        return cache;
    }

    private void assertErrorCount(String operation, double expected) {
        assertEquals(expected, meterRegistry.get(FailOpenCacheErrorHandler.ERROR_METRIC_NAME)
                .tag("cache", JobCacheNames.OPEN_JOBS)
                .tag("operation", operation)
                .counter()
                .count());
    }
}
