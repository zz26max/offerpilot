package net.jrodolfo.jobportal.messaging;

import net.jrodolfo.jobportal.service.ResumeOutboxService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@ConditionalOnProperty(name = "resume.processing.publisher.enabled", havingValue = "true", matchIfMissing = true)
public class ResumeOutboxPublisher {

    private static final Logger log = LoggerFactory.getLogger(ResumeOutboxPublisher.class);

    private final ResumeOutboxService outboxService;
    private final ResumeMessageSender messageSender;
    private final String instanceId = UUID.randomUUID().toString();

    public ResumeOutboxPublisher(ResumeOutboxService outboxService, ResumeMessageSender messageSender) {
        this.outboxService = outboxService;
        this.messageSender = messageSender;
    }

    @Scheduled(fixedDelayString = "${resume.processing.publisher.poll-interval:1s}")
    public void publishPending() {
        for (ClaimedOutboxEvent event : outboxService.claimBatch(instanceId)) {
            try {
                PublishResult result = messageSender.send(event);
                if (result == PublishResult.CONFIRMED) {
                    outboxService.markPublished(event.eventId(), instanceId);
                } else {
                    outboxService.markFailedAttempt(event.eventId(), instanceId, result.name());
                }
            } catch (RuntimeException ex) {
                log.warn("Resume outbox publish attempt failed ({})", ex.getClass().getSimpleName());
                outboxService.markFailedAttempt(event.eventId(), instanceId, "BROKER_UNAVAILABLE");
            }
        }
    }
}
