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
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringJUnitConfig(classes = {
        JobService.class,
        CacheConfig.class,
        JobServiceCachingTest.TestConfig.class
})
class JobServiceCachingTest {

    @Autowired
    private JobService jobService;

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private CacheManager cacheManager;

    @BeforeEach
    void resetState() {
        reset(jobRepository, applicationRepository);
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    }

    @Test
    void openJobsAreServedFromCacheAfterFirstRepositoryCall() {
        List<Job> jobs = List.of(job(1L, "Java Developer"));
        when(jobRepository.findByStatusOrderByCreatedAtDesc(JobStatus.OPEN)).thenReturn(jobs);

        assertSame(jobs, jobService.getOpenJobs());
        assertSame(jobs, jobService.getOpenJobs());

        verify(jobRepository, times(1)).findByStatusOrderByCreatedAtDesc(JobStatus.OPEN);
    }

    @Test
    void allJobsAreServedFromCacheAfterFirstRepositoryCall() {
        List<Job> jobs = List.of(job(2L, "QA Engineer"));
        when(jobRepository.findAll()).thenReturn(jobs);

        assertSame(jobs, jobService.getAllJobs());
        assertSame(jobs, jobService.getAllJobs());

        verify(jobRepository, times(1)).findAll();
    }

    @Test
    void jobByIdIsServedFromCacheAfterFirstRepositoryCall() {
        Job job = job(3L, "Platform Engineer");
        when(jobRepository.findById(3L)).thenReturn(Optional.of(job));

        assertSame(job, jobService.getJobById(3L));
        assertSame(job, jobService.getJobById(3L));

        verify(jobRepository, times(1)).findById(3L);
    }

    @Test
    void createEvictsBothListsAndCreatedJobId() {
        primeCaches(4L);
        Job created = job(4L, "New role");
        when(jobRepository.save(created)).thenReturn(created);

        assertSame(created, jobService.createJob(created));
        reloadCaches(4L);

        verify(jobRepository, times(2)).findByStatusOrderByCreatedAtDesc(JobStatus.OPEN);
        verify(jobRepository, times(2)).findAll();
        verify(jobRepository, times(2)).findById(4L);
    }

    @Test
    void updateEvictsBothListsAndUpdatedJobId() {
        Job existing = primeCaches(5L);
        Job incoming = new Job("Updated", "Updated description", "Updated company");
        when(jobRepository.findById(5L)).thenReturn(Optional.of(existing));
        when(jobRepository.save(existing)).thenReturn(existing);

        assertSame(existing, jobService.updateJob(5L, incoming));
        reloadCaches(5L);

        verify(jobRepository, times(2)).findByStatusOrderByCreatedAtDesc(JobStatus.OPEN);
        verify(jobRepository, times(2)).findAll();
        verify(jobRepository, times(3)).findById(5L);
    }

    @Test
    void statusUpdateEvictsBothListsAndUpdatedJobId() {
        Job existing = primeCaches(6L);
        when(jobRepository.findById(6L)).thenReturn(Optional.of(existing));
        when(jobRepository.save(existing)).thenReturn(existing);

        assertSame(existing, jobService.updateJobStatus(6L, JobStatus.CLOSED));
        reloadCaches(6L);

        verify(jobRepository, times(2)).findByStatusOrderByCreatedAtDesc(JobStatus.OPEN);
        verify(jobRepository, times(2)).findAll();
        verify(jobRepository, times(3)).findById(6L);
    }

    @Test
    void deleteEvictsBothListsAndDeletedJobId() {
        primeCaches(7L);
        when(jobRepository.existsById(7L)).thenReturn(true);
        when(applicationRepository.existsByJob_Id(7L)).thenReturn(false);

        jobService.deleteJob(7L);
        reloadCaches(7L);

        verify(jobRepository, times(2)).findByStatusOrderByCreatedAtDesc(JobStatus.OPEN);
        verify(jobRepository, times(2)).findAll();
        verify(jobRepository, times(2)).findById(7L);
    }

    @Test
    void failedUpdateDoesNotEvictExistingEntries() {
        primeCaches(8L);
        Job incoming = new Job("Updated", "Updated description", "Updated company");
        when(jobRepository.findById(8L)).thenThrow(new IllegalStateException("database unavailable"));

        assertThrows(IllegalStateException.class, () -> jobService.updateJob(8L, incoming));
        jobService.getOpenJobs();
        jobService.getAllJobs();
        jobService.getJobById(8L);

        verify(jobRepository, times(1)).findByStatusOrderByCreatedAtDesc(JobStatus.OPEN);
        verify(jobRepository, times(1)).findAll();
        verify(jobRepository, times(2)).findById(8L);
    }

    private Job primeCaches(Long id) {
        Job existing = job(id, "Existing role");
        List<Job> jobs = List.of(existing);
        when(jobRepository.findByStatusOrderByCreatedAtDesc(JobStatus.OPEN)).thenReturn(jobs);
        when(jobRepository.findAll()).thenReturn(jobs);
        when(jobRepository.findById(id)).thenReturn(Optional.of(existing));
        jobService.getOpenJobs();
        jobService.getAllJobs();
        jobService.getJobById(id);
        return existing;
    }

    private void reloadCaches(Long id) {
        jobService.getOpenJobs();
        jobService.getAllJobs();
        jobService.getJobById(id);
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
            return new ConcurrentMapCacheManager(
                    JobCacheNames.OPEN_JOBS,
                    JobCacheNames.ALL_JOBS,
                    JobCacheNames.JOB_BY_ID
            );
        }

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }
}
