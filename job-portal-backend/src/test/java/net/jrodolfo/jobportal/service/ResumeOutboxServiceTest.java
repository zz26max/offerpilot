package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.OutboxStatus;
import net.jrodolfo.jobportal.messaging.ResumeMessagingConstants;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.model.ResumeOutboxEvent;
import net.jrodolfo.jobportal.repository.ResumeOutboxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResumeOutboxServiceTest {

    @Mock
    private ResumeOutboxRepository outboxRepository;

    private ResumeOutboxService service;
    private ResumeOutboxEvent event;

    @BeforeEach
    void setUp() {
        service = new ResumeOutboxService(
                outboxRepository,
                new NoOpTransactionManager(),
                20,
                Duration.ofSeconds(30),
                Duration.ofSeconds(1),
                Duration.ofSeconds(8)
        );
        Resume resume = new Resume();
        resume.setId(42L);
        event = new ResumeOutboxEvent(
                "11111111-1111-1111-1111-111111111111",
                resume,
                ResumeMessagingConstants.EVENT_TYPE,
                ResumeMessagingConstants.SCHEMA_VERSION
        );
        event.setId(7L);
    }

    @Test
    void claimingUsesLeaseAndReturnsOnlyMinimalMessageFields() {
        when(outboxRepository.findClaimable(
                any(OutboxStatus.class), any(OutboxStatus.class), any(LocalDateTime.class), any(Pageable.class)
        )).thenReturn(List.of(event));

        LocalDateTime before = LocalDateTime.now();
        var claimed = service.claimBatch("publisher-one");

        assertEquals(1, claimed.size());
        assertEquals(event.getEventId(), claimed.getFirst().eventId());
        assertEquals(42L, claimed.getFirst().resumeId());
        assertEquals(OutboxStatus.IN_PROGRESS, event.getStatus());
        assertEquals("publisher-one", event.getLockedBy());
        assertTrue(event.getLockedUntil().isAfter(before.plusSeconds(29)));
        verify(outboxRepository).saveAllAndFlush(List.of(event));
    }

    @Test
    void failureReturnsEventToPendingWithCappedExponentialBackoffAndSafeErrorLength() {
        event.setStatus(OutboxStatus.IN_PROGRESS);
        event.setLockedBy("publisher-one");
        event.setLockedUntil(LocalDateTime.now().plusSeconds(30));
        event.setAttemptCount(4);
        when(outboxRepository.findByEventIdAndLockedBy(event.getEventId(), "publisher-one"))
                .thenReturn(Optional.of(event));

        LocalDateTime before = LocalDateTime.now();
        service.markFailedAttempt(event.getEventId(), "publisher-one", "x".repeat(300));

        assertEquals(5, event.getAttemptCount());
        assertEquals(OutboxStatus.PENDING, event.getStatus());
        assertNull(event.getLockedBy());
        assertNull(event.getLockedUntil());
        assertEquals(255, event.getLastError().length());
        assertTrue(event.getAvailableAt().isAfter(before.plusSeconds(7)));
        assertTrue(event.getAvailableAt().isBefore(before.plusSeconds(9)));
        verify(outboxRepository).saveAndFlush(event);
    }

    @Test
    void confirmedEventIsRetainedAsPublishedAuditRecord() {
        event.setStatus(OutboxStatus.IN_PROGRESS);
        event.setLockedBy("publisher-one");
        when(outboxRepository.findByEventIdAndLockedBy(event.getEventId(), "publisher-one"))
                .thenReturn(Optional.of(event));

        service.markPublished(event.getEventId(), "publisher-one");

        assertEquals(OutboxStatus.PUBLISHED, event.getStatus());
        assertNull(event.getLockedBy());
        assertNull(event.getLockedUntil());
        assertTrue(event.getPublishedAt().isBefore(LocalDateTime.now().plusSeconds(1)));
        verify(outboxRepository).saveAndFlush(event);
    }

    private static final class NoOpTransactionManager extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
