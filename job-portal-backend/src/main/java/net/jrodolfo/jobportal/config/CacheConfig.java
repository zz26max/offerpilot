package net.jrodolfo.jobportal.config;

import io.micrometer.core.instrument.MeterRegistry;
import net.jrodolfo.jobportal.observability.JobCacheMetricsBinder;
import org.springframework.boot.autoconfigure.cache.RedisCacheManagerBuilderCustomizer;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Enables annotation-driven caching and fail-open cache error handling.
 */
@Configuration
@EnableCaching
public class CacheConfig implements CachingConfigurer {

    private final MeterRegistry meterRegistry;

    public CacheConfig(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Bean
    @Override
    public CacheErrorHandler errorHandler() {
        return new FailOpenCacheErrorHandler(meterRegistry);
    }

    /**
     * Defers cache writes and evictions until a surrounding transaction commits.
     */
    @Bean
    public RedisCacheManagerBuilderCustomizer transactionAwareRedisCacheManager() {
        return builder -> builder
                .enableStatistics()
                .transactionAware();
    }

    @Bean
    public JobCacheMetricsBinder jobCacheMetricsBinder(CacheManager cacheManager) {
        return new JobCacheMetricsBinder(cacheManager);
    }
}
