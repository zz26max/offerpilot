package net.jrodolfo.jobportal.config;

import net.jrodolfo.jobportal.messaging.ResumeMessagingConstants;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Declarable;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer;
import org.springframework.amqp.rabbit.support.ListenerExecutionFailedException;

import java.util.Collection;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ResumeMessagingConfigTest {

    private final ResumeMessagingConfig config = new ResumeMessagingConfig();

    @Test
    void topologyUsesDurableMainQueueAndFinalDeadLetterQueue() {
        Declarables topology = config.resumeRabbitTopology();
        Collection<Declarable> declarables = topology.getDeclarables();

        DirectExchange exchange = declarables.stream()
                .filter(DirectExchange.class::isInstance)
                .map(DirectExchange.class::cast)
                .filter(item -> item.getName().equals(ResumeMessagingConstants.EXCHANGE))
                .findFirst().orElseThrow();
        Queue queue = declarables.stream()
                .filter(Queue.class::isInstance)
                .map(Queue.class::cast)
                .filter(item -> item.getName().equals(ResumeMessagingConstants.QUEUE))
                .findFirst().orElseThrow();
        Queue deadLetterQueue = declarables.stream()
                .filter(Queue.class::isInstance)
                .map(Queue.class::cast)
                .filter(item -> item.getName().equals(ResumeMessagingConstants.DEAD_LETTER_QUEUE))
                .findFirst().orElseThrow();

        assertTrue(exchange.isDurable());
        assertTrue(queue.isDurable());
        assertFalse(queue.isAutoDelete());
        assertEquals(ResumeMessagingConstants.DEAD_LETTER_EXCHANGE,
                queue.getArguments().get("x-dead-letter-exchange"));
        assertTrue(deadLetterQueue.isDurable());
    }

    @Test
    void finalRecovererRejectsWithoutRequeueSoBrokerRoutesToDlq() {
        RejectAndDontRequeueRecoverer recoverer = (RejectAndDontRequeueRecoverer) config.resumeMessageRecoverer();
        Message message = new Message(new byte[0], new MessageProperties());

        ListenerExecutionFailedException exception = assertThrows(ListenerExecutionFailedException.class,
                () -> recoverer.recover(message, new IllegalStateException("parse failed")));
        assertTrue(exception.getCause() instanceof AmqpRejectAndDontRequeueException);
    }
}
