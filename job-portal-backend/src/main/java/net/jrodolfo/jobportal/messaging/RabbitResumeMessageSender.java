package net.jrodolfo.jobportal.messaging;

import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class RabbitResumeMessageSender implements ResumeMessageSender {

    private final RabbitTemplate rabbitTemplate;
    private final long confirmTimeoutMillis;

    public RabbitResumeMessageSender(RabbitTemplate rabbitTemplate,
                                     @Value("${resume.processing.publisher.confirm-timeout:5s}") java.time.Duration confirmTimeout) {
        if (confirmTimeout.isNegative() || confirmTimeout.isZero() || confirmTimeout.compareTo(java.time.Duration.ofSeconds(30)) > 0) {
            throw new IllegalArgumentException("Publisher confirm timeout must be between 1 ms and 30 seconds");
        }
        this.rabbitTemplate = rabbitTemplate;
        this.confirmTimeoutMillis = confirmTimeout.toMillis();
    }

    @Override
    public PublishResult send(ClaimedOutboxEvent event) {
        CorrelationData correlationData = new CorrelationData(event.eventId());
        rabbitTemplate.convertAndSend(
                ResumeMessagingConstants.EXCHANGE,
                ResumeMessagingConstants.ROUTING_KEY,
                event.toMessage(),
                message -> persistentMessage(message, event.eventId()),
                correlationData
        );
        try {
            CorrelationData.Confirm confirm = correlationData.getFuture()
                    .get(confirmTimeoutMillis, TimeUnit.MILLISECONDS);
            if (!confirm.isAck()) {
                return PublishResult.NACK;
            }
            return correlationData.getReturned() == null ? PublishResult.CONFIRMED : PublishResult.RETURNED;
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Publisher confirm interrupted", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Publisher confirm unavailable", ex);
        }
    }

    private Message persistentMessage(Message message, String eventId) {
        message.getMessageProperties().setDeliveryMode(MessageDeliveryMode.PERSISTENT);
        message.getMessageProperties().setMessageId(eventId);
        message.getMessageProperties().setHeader("schemaVersion", ResumeMessagingConstants.SCHEMA_VERSION);
        return message;
    }
}
