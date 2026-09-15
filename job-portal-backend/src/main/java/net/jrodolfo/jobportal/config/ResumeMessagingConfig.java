package net.jrodolfo.jobportal.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import net.jrodolfo.jobportal.exception.StaleResumeMessageException;
import net.jrodolfo.jobportal.exception.TerminalResumeMessageException;
import net.jrodolfo.jobportal.messaging.ResumeMessagingConstants;
import org.aopalliance.aop.Advice;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer;
import org.springframework.amqp.rabbit.retry.MessageRecoverer;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.amqp.SimpleRabbitListenerContainerFactoryConfigurer;
import org.springframework.boot.autoconfigure.amqp.RabbitTemplateCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.backoff.ExponentialBackOffPolicy;
import org.springframework.retry.policy.SimpleRetryPolicy;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableScheduling
public class ResumeMessagingConfig {

    @Bean
    Declarables resumeRabbitTopology() {
        DirectExchange exchange = new DirectExchange(ResumeMessagingConstants.EXCHANGE, true, false);
        DirectExchange deadLetterExchange = new DirectExchange(
                ResumeMessagingConstants.DEAD_LETTER_EXCHANGE, true, false
        );
        Queue queue = QueueBuilder.durable(ResumeMessagingConstants.QUEUE)
                .deadLetterExchange(ResumeMessagingConstants.DEAD_LETTER_EXCHANGE)
                .deadLetterRoutingKey(ResumeMessagingConstants.DEAD_LETTER_ROUTING_KEY)
                .build();
        Queue deadLetterQueue = QueueBuilder.durable(ResumeMessagingConstants.DEAD_LETTER_QUEUE).build();
        Binding binding = BindingBuilder.bind(queue)
                .to(exchange)
                .with(ResumeMessagingConstants.ROUTING_KEY);
        Binding deadLetterBinding = BindingBuilder.bind(deadLetterQueue)
                .to(deadLetterExchange)
                .with(ResumeMessagingConstants.DEAD_LETTER_ROUTING_KEY);
        return new Declarables(exchange, deadLetterExchange, queue, deadLetterQueue, binding, deadLetterBinding);
    }

    @Bean
    MessageConverter resumeMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    RabbitTemplateCustomizer resumeRabbitTemplateCustomizer(MessageConverter resumeMessageConverter) {
        return rabbitTemplate -> {
            rabbitTemplate.setMessageConverter(resumeMessageConverter);
            rabbitTemplate.setMandatory(true);
        };
    }

    @Bean
    MessageRecoverer resumeMessageRecoverer() {
        return new RejectAndDontRequeueRecoverer();
    }

    @Bean
    Advice resumeListenerRetryAdvice(
            MessageRecoverer resumeMessageRecoverer,
            @Value("${resume.processing.consumer.max-attempts:3}") int maximumAttempts,
            @Value("${resume.processing.consumer.initial-backoff:500ms}") Duration initialBackoff,
            @Value("${resume.processing.consumer.max-backoff:5s}") Duration maximumBackoff,
            @Value("${resume.processing.consumer.backoff-multiplier:2.0}") double multiplier) {
        if (maximumAttempts < 1 || maximumAttempts > 10) {
            throw new IllegalArgumentException("Resume parse attempts must be between 1 and 10");
        }
        if (initialBackoff.isNegative() || initialBackoff.isZero()
                || maximumBackoff.compareTo(initialBackoff) < 0
                || maximumBackoff.compareTo(Duration.ofMinutes(1)) > 0
                || multiplier < 1.0 || multiplier > 10.0) {
            throw new IllegalArgumentException("Resume consumer backoff configuration is invalid");
        }

        Map<Class<? extends Throwable>, Boolean> retryable = new HashMap<>();
        retryable.put(StaleResumeMessageException.class, false);
        retryable.put(TerminalResumeMessageException.class, false);
        SimpleRetryPolicy retryPolicy = new SimpleRetryPolicy(maximumAttempts, retryable, true, true);
        ExponentialBackOffPolicy backOffPolicy = new ExponentialBackOffPolicy();
        backOffPolicy.setInitialInterval(initialBackoff.toMillis());
        backOffPolicy.setMaxInterval(maximumBackoff.toMillis());
        backOffPolicy.setMultiplier(multiplier);
        RetryTemplate retryTemplate = new RetryTemplate();
        retryTemplate.setRetryPolicy(retryPolicy);
        retryTemplate.setBackOffPolicy(backOffPolicy);
        return RetryInterceptorBuilder.stateless()
                .retryOperations(retryTemplate)
                .recoverer(resumeMessageRecoverer)
                .build();
    }

    @Bean
    SimpleRabbitListenerContainerFactory resumeRabbitListenerContainerFactory(
            SimpleRabbitListenerContainerFactoryConfigurer configurer,
            ConnectionFactory connectionFactory,
            MessageConverter resumeMessageConverter,
            Advice resumeListenerRetryAdvice) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        configurer.configure(factory, connectionFactory);
        factory.setMessageConverter(resumeMessageConverter);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(resumeListenerRetryAdvice);
        return factory;
    }
}
