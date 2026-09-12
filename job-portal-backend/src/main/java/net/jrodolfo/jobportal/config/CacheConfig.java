package net.jrodolfo.jobportal.config;

import org.springframework.boot.autoconfigure.cache.RedisCacheManagerBuilderCustomizer;
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

    @Bean
    @Override
    public CacheErrorHandler errorHandler() {
        return new FailOpenCacheErrorHandler();
    }

    /**
     * Defers cache writes and evictions until a surrounding transaction commits.
     */
    @Bean
    public RedisCacheManagerBuilderCustomizer transactionAwareRedisCacheManager() {
        return builder -> builder.transactionAware();
    }
}
