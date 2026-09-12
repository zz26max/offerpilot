package net.jrodolfo.jobportal.service;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import net.jrodolfo.jobportal.config.CacheConfig;
import net.jrodolfo.jobportal.config.JobCacheNames;
import net.jrodolfo.jobportal.constant.JobStatus;
import net.jrodolfo.jobportal.model.Job;
import net.jrodolfo.jobportal.repository.ApplicationRepository;
import net.jrodolfo.jobportal.repository.JobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.lang.Nullable;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

@SpringJUnitConfig(classes = {
        JobService.class,
        CacheConfig.class,
        JobServiceCacheFailureIntegrationTest.TestConfig.class
})
class JobServiceCacheFailureIntegrationTest {

    @Autowired
    private JobService jobService;

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @BeforeEach
    void configureRepository() {
        reset(jobRepository, applicationRepository);
        Job existing = job(20L, "Existing role");
        when(jobRepository.findByStatusOrderByCreatedAtDesc(JobStatus.OPEN)).thenReturn(java.util.List.of(existing));
        when(jobRepository.findAll()).thenReturn(java.util.List.of(existing));
        when(jobRepository.findById(20L)).thenReturn(Optional.of(existing));
        when(jobRepository.save(any(Job.class))).thenAnswer(invocation -> invocation.getArgument(0, Job.class));
        when(jobRepository.existsById(20L)).thenReturn(true);
        when(applicationRepository.existsByJob_Id(20L)).thenReturn(false);
    }

    @Test
    void cacheFailuresDoNotBlockReadsOrSuccessfulWrites() {
        assertDoesNotThrow(() -> jobService.getOpenJobs());
        assertDoesNotThrow(() -> jobService.getAllJobs());
        assertDoesNotThrow(() -> jobService.getJobById(20L));

        Job created = job(21L, "New role");
        assertDoesNotThrow(() -> jobService.createJob(created));
        assertDoesNotThrow(() -> jobService.updateJob(20L,
                new Job("Updated", "Updated description", "Updated company")));
        assertDoesNotThrow(() -> jobService.updateJobStatus(20L, JobStatus.CLOSED));
        assertDoesNotThrow(() -> jobService.deleteJob(20L));
    }

    private Job job(Long id, String title) {
        Job job = new Job(title, "Description", "ACME");
        job.setId(id);
        return job;
    }

    @Configuration(proxyBeanMethods = false)
    static class TestConfig {

        @Bean
        JobRepository jobRepository() {
            return mock(JobRepository.class);
        }

        @Bean
        ApplicationRepository applicationRepository() {
            return mock(ApplicationRepository.class);
        }

        @Bean
        CacheManager cacheManager() {
            return new FailingCacheManager();
        }

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }

    private static final class FailingCacheManager implements CacheManager {

        private final Map<String, Cache> caches = new ConcurrentHashMap<>();

        @Override
        public Cache getCache(String name) {
            return caches.computeIfAbsent(name, FailingCache::new);
        }

        @Override
        public Collection<String> getCacheNames() {
            return Set.of(JobCacheNames.OPEN_JOBS, JobCacheNames.ALL_JOBS, JobCacheNames.JOB_BY_ID);
        }
    }

    private static final class FailingCache implements Cache {

        private final String name;

        private FailingCache(String name) {
            this.name = name;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public Object getNativeCache() {
            return this;
        }

        @Override
        @Nullable
        public ValueWrapper get(Object key) {
            throw unavailable();
        }

        @Override
        @Nullable
        public <T> T get(Object key, @Nullable Class<T> type) {
            throw unavailable();
        }

        @Override
        public <T> T get(Object key, Callable<T> valueLoader) {
            throw unavailable();
        }

        @Override
        public void put(Object key, @Nullable Object value) {
            throw unavailable();
        }

        @Override
        @Nullable
        public ValueWrapper putIfAbsent(Object key, @Nullable Object value) {
            throw unavailable();
        }

        @Override
        public void evict(Object key) {
            throw unavailable();
        }

        @Override
        public void clear() {
            throw unavailable();
        }

        private RuntimeException unavailable() {
            return new IllegalStateException("cache unavailable");
        }
    }
}
