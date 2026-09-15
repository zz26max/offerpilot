package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.ResumeParseStatus;
import net.jrodolfo.jobportal.messaging.ResumeMessagingConstants;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.model.ResumeOutboxEvent;
import net.jrodolfo.jobportal.repository.ResumeOutboxRepository;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;

@Component
public class ResumeUploadPersistence {

    private final ResumeRepository resumeRepository;
    private final ResumeOutboxRepository outboxRepository;
    private final TransactionTemplate transactionTemplate;

    public ResumeUploadPersistence(ResumeRepository resumeRepository,
                                   ResumeOutboxRepository outboxRepository,
                                   PlatformTransactionManager transactionManager) {
        this.resumeRepository = resumeRepository;
        this.outboxRepository = outboxRepository;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public Resume persistQueuedResume(Resume resume) {
        return transactionTemplate.execute(status -> {
            resume.setParseStatus(ResumeParseStatus.QUEUED);
            Resume saved = resumeRepository.saveAndFlush(resume);
            ResumeOutboxEvent event = new ResumeOutboxEvent(
                    UUID.randomUUID().toString(),
                    saved,
                    ResumeMessagingConstants.EVENT_TYPE,
                    ResumeMessagingConstants.SCHEMA_VERSION
            );
            outboxRepository.saveAndFlush(event);
            return saved;
        });
    }
}
