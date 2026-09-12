package net.jrodolfo.jobportal.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.interceptor.CacheErrorHandler;

/**
 * Keeps database-backed business operations available when the cache is unavailable.
 */
public class FailOpenCacheErrorHandler implements CacheErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(FailOpenCacheErrorHandler.class);

    @Override
    public void handleCacheGetError(RuntimeException exception, Cache cache, Object key) {
        warn("read", cache, exception);
    }

    @Override
    public void handleCachePutError(RuntimeException exception, Cache cache, Object key, Object value) {
        warn("write", cache, exception);
    }

    @Override
    public void handleCacheEvictError(RuntimeException exception, Cache cache, Object key) {
        warn("eviction", cache, exception);
    }

    @Override
    public void handleCacheClearError(RuntimeException exception, Cache cache) {
        warn("clear", cache, exception);
    }

    private void warn(String operation, Cache cache, RuntimeException exception) {
        log.warn("Cache {} failed for cache '{}'; continuing without cache ({})",
                operation, cache.getName(), exception.getClass().getSimpleName());
    }
}
