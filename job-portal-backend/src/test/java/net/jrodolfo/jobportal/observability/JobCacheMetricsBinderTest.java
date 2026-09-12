package net.jrodolfo.jobportal.observability;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import net.jrodolfo.jobportal.config.JobCacheNames;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.cache.transaction.TransactionAwareCacheDecorator;
import org.springframework.data.redis.cache.CacheStatistics;
import org.springframework.data.redis.cache.RedisCache;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JobCacheMetricsBinderTest {

    @Test
    void exportsHitAndMissCountersForKnownRedisCaches() {
        CacheManager cacheManager = mock(CacheManager.class);
        RedisCache redisCache = mock(RedisCache.class);
        CacheStatistics statistics = mock(CacheStatistics.class);
        when(cacheManager.getCache(JobCacheNames.OPEN_JOBS))
                .thenReturn(new TransactionAwareCacheDecorator(redisCache));
        when(redisCache.getStatistics()).thenReturn(statistics);
        when(statistics.getHits()).thenReturn(7L);
        when(statistics.getMisses()).thenReturn(3L);

        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        new JobCacheMetricsBinder(cacheManager).bindTo(registry);

        assertEquals(7.0, registry.get(JobCacheMetricsBinder.REQUEST_METRIC_NAME)
                .tag("cache", JobCacheNames.OPEN_JOBS)
                .tag("result", "hit")
                .functionCounter()
                .count());
        assertEquals(3.0, registry.get(JobCacheMetricsBinder.REQUEST_METRIC_NAME)
                .tag("cache", JobCacheNames.OPEN_JOBS)
                .tag("result", "miss")
                .functionCounter()
                .count());
    }
}
