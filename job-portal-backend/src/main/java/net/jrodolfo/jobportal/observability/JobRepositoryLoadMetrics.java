package net.jrodolfo.jobportal.observability;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * Counts executions of fixed repository-backed job read paths. This is not a count of arbitrary SQL statements.
 */
@Component
public class JobRepositoryLoadMetrics {

    public static final String METRIC_NAME = "offerpilot.job.repository.loads";
    public static final String OPEN_JOBS_QUERY = "open-jobs";

    private final Counter openJobsLoads;

    public JobRepositoryLoadMetrics(MeterRegistry meterRegistry) {
        openJobsLoads = Counter.builder(METRIC_NAME)
                .description("Job repository read invocations caused by execution of cacheable service method bodies")
                .tag("query", OPEN_JOBS_QUERY)
                .register(meterRegistry);
    }

    public void recordOpenJobsLoad() {
        openJobsLoads.increment();
    }
}
