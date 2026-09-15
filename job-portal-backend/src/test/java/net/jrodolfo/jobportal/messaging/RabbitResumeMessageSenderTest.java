package net.jrodolfo.jobportal.messaging;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessagePostProcessor;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.ReturnedMessage;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RabbitResumeMessageSenderTest {

    @Mock
    private RabbitTemplate rabbitTemplate;

    private RabbitResumeMessageSender sender;
    private ClaimedOutboxEvent event;
    private AtomicReference<Message> publishedMessage;

    @BeforeEach
    void setUp() {
        sender = new RabbitResumeMessageSender(rabbitTemplate, Duration.ofSeconds(1));
        event = new ClaimedOutboxEvent(
                "11111111-1111-1111-1111-111111111111",
                42L,
                ResumeMessagingConstants.EVENT_TYPE,
                ResumeMessagingConstants.SCHEMA_VERSION
        );
        publishedMessage = new AtomicReference<>();
    }

    @Test
    void confirmedPublishUsesPersistentMinimalMessageAndEventIdCorrelation() {
        configureConfirm(true, false);

        PublishResult result = sender.send(event);

        assertEquals(PublishResult.CONFIRMED, result);
        Message message = publishedMessage.get();
        assertEquals(MessageDeliveryMode.PERSISTENT, message.getMessageProperties().getDeliveryMode());
        assertEquals(event.eventId(), message.getMessageProperties().getMessageId());
        assertEquals(ResumeMessagingConstants.SCHEMA_VERSION,
                ((Number) message.getMessageProperties().getHeader("schemaVersion")).intValue());

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        ArgumentCaptor<CorrelationData> correlation = ArgumentCaptor.forClass(CorrelationData.class);
        verify(rabbitTemplate).convertAndSend(
                anyString(), anyString(), payload.capture(), any(MessagePostProcessor.class), correlation.capture()
        );
        ResumeParseMessage parseMessage = assertInstanceOf(ResumeParseMessage.class, payload.getValue());
        assertEquals(event.eventId(), parseMessage.eventId());
        assertEquals(event.resumeId(), parseMessage.resumeId());
        assertEquals(event.eventType(), parseMessage.eventType());
        assertEquals(event.schemaVersion(), parseMessage.schemaVersion());
        assertEquals(event.eventId(), correlation.getValue().getId());
        assertEquals(4, ResumeParseMessage.class.getRecordComponents().length);
    }

    @Test
    void negativeConfirmIsReportedWithoutPretendingDeliverySucceeded() {
        configureConfirm(false, false);

        assertEquals(PublishResult.NACK, sender.send(event));
    }

    @Test
    void mandatoryReturnWinsEvenAfterPositiveConfirm() {
        configureConfirm(true, true);

        assertEquals(PublishResult.RETURNED, sender.send(event));
    }

    @Test
    void missingConfirmIsReportedAsUnavailable() {
        doAnswer(invocation -> null).when(rabbitTemplate).convertAndSend(
                anyString(), anyString(), any(), any(MessagePostProcessor.class), any(CorrelationData.class)
        );

        IllegalStateException exception = assertThrows(IllegalStateException.class, () -> sender.send(event));

        assertFalse(exception.getMessage().contains("rabbit"));
    }

    private void configureConfirm(boolean ack, boolean returned) {
        doAnswer(invocation -> {
            MessagePostProcessor postProcessor = invocation.getArgument(3);
            CorrelationData correlation = invocation.getArgument(4);
            Message message = postProcessor.postProcessMessage(new Message(new byte[0], new MessageProperties()));
            publishedMessage.set(message);
            if (returned) {
                correlation.setReturned(new ReturnedMessage(message, 312, "NO_ROUTE", "exchange", "key"));
            }
            correlation.getFuture().complete(new CorrelationData.Confirm(ack, ack ? null : "nack"));
            return null;
        }).when(rabbitTemplate).convertAndSend(
                anyString(), anyString(), any(), any(MessagePostProcessor.class), any(CorrelationData.class)
        );
    }
}
