package net.jrodolfo.jobportal.messaging;

import net.jrodolfo.jobportal.service.ResumeParseProcessor;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class ResumeParseListener {

    private final ResumeParseProcessor processor;

    public ResumeParseListener(ResumeParseProcessor processor) {
        this.processor = processor;
    }

    @RabbitListener(
            queues = ResumeMessagingConstants.QUEUE,
            containerFactory = "resumeRabbitListenerContainerFactory",
            autoStartup = "${resume.processing.listener.enabled:true}"
    )
    public void consume(ResumeParseMessage message) {
        processor.process(message);
    }
}
