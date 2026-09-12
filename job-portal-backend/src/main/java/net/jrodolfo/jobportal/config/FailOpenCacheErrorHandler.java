package net.jrodolfo.jobportal.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.interceptor.CacheErrorHandler;

/**
 * Keeps database-backed business operations available when the cache is unavailable.
 */
public class FailOpenCacheErrorHandler implements CacheErrorHandler {

    public static final String ERROR_METRIC_NAME = "offerpilot.cache.fail.open.errors";

    private static final Logger log = LoggerFactory.getLogger(FailOpenCacheErrorHandler.class);
    private static final String UNKNOWN_CACHE = "other";

    private final MeterRegistry meterRegistry;

    public FailOpenCacheErrorHandler(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

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
        Counter.builder(ERROR_METRIC_NAME)
                .description("Cache failures ignored to keep database-backed operations available")
                .tags("cache", metricCacheName(cache.getName()), "operation", operation)
                .register(meterRegistry)
                .increment();
        log.warn("Cache {} failed for cache '{}'; continuing without cache ({})",
                operation, cache.getName(), exception.getClass().getSimpleName());
    }

    private String metricCacheName(String cacheName) {
        return switch (cacheName) {
            case JobCacheNames.OPEN_JOBS, JobCacheNames.ALL_JOBS, JobCacheNames.JOB_BY_ID -> cacheName;
            default -> UNKNOWN_CACHE;
        };
    }
}
