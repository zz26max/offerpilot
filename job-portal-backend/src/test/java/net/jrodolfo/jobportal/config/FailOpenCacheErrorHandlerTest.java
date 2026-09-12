package net.jrodolfo.jobportal.config;

import org.junit.jupiter.api.Test;
import org.springframework.cache.Cache;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FailOpenCacheErrorHandlerTest {

    private final FailOpenCacheErrorHandler handler = new FailOpenCacheErrorHandler();
    private final RuntimeException failure = new RuntimeException("cache unavailable");

    @Test
    void getFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCacheGetError(failure, cache, "hidden-key"));
    }

    @Test
    void putFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCachePutError(failure, cache, "hidden-key", "hidden-value"));
    }

    @Test
    void evictionFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCacheEvictError(failure, cache, "hidden-key"));
    }

    @Test
    void clearFailureDoesNotEscape() {
        Cache cache = cache();
        assertDoesNotThrow(() -> handler.handleCacheClearError(failure, cache));
    }

    private Cache cache() {
        Cache cache = mock(Cache.class);
        when(cache.getName()).thenReturn("test-cache");
        return cache;
    }
}
