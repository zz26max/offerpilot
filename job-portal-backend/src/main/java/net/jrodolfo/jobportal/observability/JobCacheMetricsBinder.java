package net.jrodolfo.jobportal.observability;

import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import net.jrodolfo.jobportal.config.JobCacheNames;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.transaction.TransactionAwareCacheDecorator;
import org.springframework.data.redis.cache.RedisCache;

import java.util.List;

/**
 * Exposes Redis-local hit and miss statistics for the fixed set of job caches.
 * Cache keys are deliberately never used as metric tags.
 */
public class JobCacheMetricsBinder implements MeterBinder {

    public static final String REQUEST_METRIC_NAME = "offerpilot.cache.requests";

    private static final List<String> JOB_CACHES = List.of(
            JobCacheNames.OPEN_JOBS,
            JobCacheNames.ALL_JOBS,
            JobCacheNames.JOB_BY_ID
    );

    private final CacheManager cacheManager;

    public JobCacheMetricsBinder(CacheManager cacheManager) {
        this.cacheManager = cacheManager;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        JOB_CACHES.forEach(cacheName -> bindCache(registry, cacheName));
    }

    private void bindCache(MeterRegistry registry, String cacheName) {
        Cache cache = cacheManager.getCache(cacheName);
        while (cache instanceof TransactionAwareCacheDecorator decorator) {
            cache = decorator.getTargetCache();
        }
        if (!(cache instanceof RedisCache redisCache)) {
            return;
        }

        FunctionCounter.builder(REQUEST_METRIC_NAME, redisCache,
                        candidate -> candidate.getStatistics().getHits())
                .description("Redis job cache lookups")
                .tags("cache", cacheName, "result", "hit")
                .register(registry);
        FunctionCounter.builder(REQUEST_METRIC_NAME, redisCache,
                        candidate -> candidate.getStatistics().getMisses())
                .description("Redis job cache lookups")
                .tags("cache", cacheName, "result", "miss")
                .register(registry);
    }
}
