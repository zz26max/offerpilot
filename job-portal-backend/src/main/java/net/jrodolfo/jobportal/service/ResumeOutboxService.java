package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.OutboxStatus;
import net.jrodolfo.jobportal.messaging.ClaimedOutboxEvent;
import net.jrodolfo.jobportal.model.ResumeOutboxEvent;
import net.jrodolfo.jobportal.repository.ResumeOutboxRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class ResumeOutboxService {

    private final ResumeOutboxRepository outboxRepository;
    private final TransactionTemplate transactionTemplate;
    private final int batchSize;
    private final Duration claimLease;
    private final Duration initialBackoff;
    private final Duration maxBackoff;

    public ResumeOutboxService(ResumeOutboxRepository outboxRepository,
                               PlatformTransactionManager transactionManager,
                               @Value("${resume.processing.publisher.batch-size:20}") int batchSize,
                               @Value("${resume.processing.publisher.claim-lease:30s}") Duration claimLease,
                               @Value("${resume.processing.publisher.initial-backoff:1s}") Duration initialBackoff,
                               @Value("${resume.processing.publisher.max-backoff:1m}") Duration maxBackoff) {
        if (batchSize < 1 || batchSize > 200) {
            throw new IllegalArgumentException("Outbox batch size must be between 1 and 200");
        }
        if (claimLease.isNegative() || claimLease.isZero() || claimLease.compareTo(Duration.ofMinutes(10)) > 0) {
            throw new IllegalArgumentException("Outbox claim lease must be between 1 ms and 10 minutes");
        }
        if (initialBackoff.isNegative() || initialBackoff.isZero()
                || maxBackoff.compareTo(initialBackoff) < 0 || maxBackoff.compareTo(Duration.ofHours(1)) > 0) {
            throw new IllegalArgumentException("Outbox retry backoff configuration is invalid");
        }
        this.outboxRepository = outboxRepository;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.batchSize = batchSize;
        this.claimLease = claimLease;
        this.initialBackoff = initialBackoff;
        this.maxBackoff = maxBackoff;
    }

    public List<ClaimedOutboxEvent> claimBatch(String instanceId) {
        return transactionTemplate.execute(status -> {
            LocalDateTime now = LocalDateTime.now();
            List<ResumeOutboxEvent> events = outboxRepository.findClaimable(
                    OutboxStatus.PENDING,
                    OutboxStatus.IN_PROGRESS,
                    now,
                    PageRequest.of(0, batchSize)
            );
            LocalDateTime lockedUntil = now.plus(claimLease);
            events.forEach(event -> {
                event.setStatus(OutboxStatus.IN_PROGRESS);
                event.setLockedBy(instanceId);
                event.setLockedUntil(lockedUntil);
            });
            outboxRepository.saveAllAndFlush(events);
            return events.stream()
                    .map(event -> new ClaimedOutboxEvent(
                            event.getEventId(),
                            event.getResume().getId(),
                            event.getEventType(),
                            event.getSchemaVersion()
                    ))
                    .toList();
        });
    }

    public void markPublished(String eventId, String instanceId) {
        transactionTemplate.executeWithoutResult(status ->
                outboxRepository.findByEventIdAndLockedBy(eventId, instanceId).ifPresent(event -> {
                    event.setStatus(OutboxStatus.PUBLISHED);
                    event.setPublishedAt(LocalDateTime.now());
                    event.setLockedBy(null);
                    event.setLockedUntil(null);
                    event.setLastError(null);
                    outboxRepository.saveAndFlush(event);
                })
        );
    }

    public void markFailedAttempt(String eventId, String instanceId, String safeErrorCode) {
        transactionTemplate.executeWithoutResult(status ->
                outboxRepository.findByEventIdAndLockedBy(eventId, instanceId).ifPresent(event -> {
                    int attempts = event.getAttemptCount() + 1;
                    event.setAttemptCount(attempts);
                    event.setStatus(OutboxStatus.PENDING);
                    event.setAvailableAt(LocalDateTime.now().plus(backoffForAttempt(attempts)));
                    event.setLockedBy(null);
                    event.setLockedUntil(null);
                    event.setLastError(limit(safeErrorCode, 255));
                    outboxRepository.saveAndFlush(event);
                })
        );
    }

    private Duration backoffForAttempt(int attempt) {
        int shift = Math.min(Math.max(attempt - 1, 0), 30);
        long multiplier = 1L << shift;
        Duration candidate;
        try {
            candidate = initialBackoff.multipliedBy(multiplier);
        } catch (ArithmeticException ex) {
            return maxBackoff;
        }
        return candidate.compareTo(maxBackoff) > 0 ? maxBackoff : candidate;
    }

    private String limit(String value, int maximumLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maximumLength ? value : value.substring(0, maximumLength);
    }
}
