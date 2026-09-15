package net.jrodolfo.jobportal.messaging;

public interface ResumeMessageSender {

    PublishResult send(ClaimedOutboxEvent event);
}
