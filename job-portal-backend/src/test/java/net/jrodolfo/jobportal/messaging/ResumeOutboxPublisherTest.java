package net.jrodolfo.jobportal.messaging;

import net.jrodolfo.jobportal.service.ResumeOutboxService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResumeOutboxPublisherTest {

    @Mock
    private ResumeOutboxService outboxService;
    @Mock
    private ResumeMessageSender messageSender;

    private ResumeOutboxPublisher publisher;
    private ClaimedOutboxEvent event;

    @BeforeEach
    void setUp() {
        publisher = new ResumeOutboxPublisher(outboxService, messageSender);
        event = new ClaimedOutboxEvent(
                "event-id", 10L, ResumeMessagingConstants.EVENT_TYPE, ResumeMessagingConstants.SCHEMA_VERSION
        );
        when(outboxService.claimBatch(anyString())).thenReturn(List.of(event));
    }

    @Test
    void confirmedPublishMarksEventPublished() {
        when(messageSender.send(event)).thenReturn(PublishResult.CONFIRMED);

        publisher.publishPending();

        verify(outboxService).markPublished(org.mockito.ArgumentMatchers.eq("event-id"), anyString());
        verify(outboxService, never()).markFailedAttempt(
                org.mockito.ArgumentMatchers.anyString(), anyString(), org.mockito.ArgumentMatchers.anyString()
        );
    }

    @Test
    void mandatoryReturnKeepsEventPendingWithSafeClassification() {
        when(messageSender.send(event)).thenReturn(PublishResult.RETURNED);

        publisher.publishPending();

        verify(outboxService).markFailedAttempt(
                org.mockito.ArgumentMatchers.eq("event-id"), anyString(), org.mockito.ArgumentMatchers.eq("RETURNED")
        );
    }

    @Test
    void negativeConfirmKeepsEventPendingWithSafeClassification() {
        when(messageSender.send(event)).thenReturn(PublishResult.NACK);

        publisher.publishPending();

        verify(outboxService).markFailedAttempt(
                org.mockito.ArgumentMatchers.eq("event-id"), anyString(), org.mockito.ArgumentMatchers.eq("NACK")
        );
    }

    @Test
    void connectionFailureKeepsEventPendingWithoutPersistingExceptionDetails() {
        when(messageSender.send(event)).thenThrow(new IllegalStateException("amqp://secret@internal-host"));

        publisher.publishPending();

        verify(outboxService).markFailedAttempt(
                org.mockito.ArgumentMatchers.eq("event-id"), anyString(), org.mockito.ArgumentMatchers.eq("BROKER_UNAVAILABLE")
        );
    }
}
