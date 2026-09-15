package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.ResumeParseStatus;
import net.jrodolfo.jobportal.exception.ResumeParseException;
import net.jrodolfo.jobportal.exception.ResumeStorageException;
import net.jrodolfo.jobportal.exception.StaleResumeMessageException;
import net.jrodolfo.jobportal.exception.TerminalResumeMessageException;
import net.jrodolfo.jobportal.messaging.ResumeMessagingConstants;
import net.jrodolfo.jobportal.messaging.ResumeParseMessage;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import net.jrodolfo.jobportal.storage.ResumeStorage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;

@Service
public class ResumeParseProcessor {

    private final ResumeRepository resumeRepository;
    private final ResumeStorage resumeStorage;
    private final ResumeTextExtractor textExtractor;
    private final TransactionTemplate transactionTemplate;
    private final int maximumAttempts;

    public ResumeParseProcessor(ResumeRepository resumeRepository,
                                ResumeStorage resumeStorage,
                                ResumeTextExtractor textExtractor,
                                PlatformTransactionManager transactionManager,
                                @Value("${resume.processing.consumer.max-attempts:3}") int maximumAttempts) {
        if (maximumAttempts < 1 || maximumAttempts > 10) {
            throw new IllegalArgumentException("Resume parse attempts must be between 1 and 10");
        }
        this.resumeRepository = resumeRepository;
        this.resumeStorage = resumeStorage;
        this.textExtractor = textExtractor;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.maximumAttempts = maximumAttempts;
    }

    public void process(ResumeParseMessage message) {
        validateMessage(message);
        try {
            transactionTemplate.executeWithoutResult(status -> processWithLock(message.resumeId()));
        } catch (StaleResumeMessageException | TerminalResumeMessageException ex) {
            throw ex;
        } catch (ResumeParseException ex) {
            recordFailure(message.resumeId(), ex.getErrorCode(), ex.getSafeSummary());
            throw ex;
        } catch (ResumeStorageException ex) {
            ResumeParseException safe = new ResumeParseException(
                    "STORAGE_UNAVAILABLE", "Stored resume content is unavailable", ex
            );
            recordFailure(message.resumeId(), safe.getErrorCode(), safe.getSafeSummary());
            throw safe;
        } catch (RuntimeException ex) {
            ResumeParseException safe = new ResumeParseException(
                    "PROCESSING_ERROR", "Resume processing failed", ex
            );
            recordFailure(message.resumeId(), safe.getErrorCode(), safe.getSafeSummary());
            throw safe;
        }
    }

    private void processWithLock(Long resumeId) {
        Resume resume = resumeRepository.findByIdForUpdate(resumeId)
                .orElseThrow(() -> new StaleResumeMessageException("Resume no longer exists"));
        if (resume.getParseStatus() == ResumeParseStatus.SUCCEEDED) {
            return;
        }
        if (resume.getParseStatus() == ResumeParseStatus.FAILED) {
            throw new TerminalResumeMessageException("Resume parsing has already failed permanently");
        }

        resume.setParseStatus(ResumeParseStatus.PROCESSING);
        String extracted = textExtractor.extract(
                resumeStorage.load(resume.getStorageKey()),
                resume.getContentType()
        );
        if (extracted == null || extracted.isBlank()) {
            throw new ResumeParseException("EMPTY_TEXT", "Resume contains no extractable text");
        }

        resume.setExtractedText(extracted);
        resume.setParseStatus(ResumeParseStatus.SUCCEEDED);
        resume.setParsedAt(LocalDateTime.now());
        resume.setErrorCode(null);
        resume.setErrorSummary(null);
        resumeRepository.saveAndFlush(resume);
    }

    private void recordFailure(Long resumeId, String errorCode, String safeSummary) {
        transactionTemplate.executeWithoutResult(status -> {
            Resume resume = resumeRepository.findByIdForUpdate(resumeId)
                    .orElseThrow(() -> new StaleResumeMessageException("Resume no longer exists"));
            if (resume.getParseStatus() == ResumeParseStatus.SUCCEEDED) {
                return;
            }
            int attempts = resume.getParseAttempts() + 1;
            resume.setParseAttempts(attempts);
            resume.setParseStatus(attempts >= maximumAttempts
                    ? ResumeParseStatus.FAILED
                    : ResumeParseStatus.QUEUED);
            resume.setErrorCode(limit(errorCode, 64));
            resume.setErrorSummary(limit(safeSummary, 255));
            resume.setParsedAt(null);
            resumeRepository.saveAndFlush(resume);
        });
    }

    private void validateMessage(ResumeParseMessage message) {
        if (message == null
                || message.resumeId() == null
                || message.eventId() == null
                || !ResumeMessagingConstants.EVENT_TYPE.equals(message.eventType())
                || message.schemaVersion() != ResumeMessagingConstants.SCHEMA_VERSION) {
            throw new StaleResumeMessageException("Unsupported or malformed resume event");
        }
    }

    private String limit(String value, int maximumLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maximumLength ? value : value.substring(0, maximumLength);
    }
}
