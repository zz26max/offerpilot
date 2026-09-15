package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.ResumeParseStatus;
import net.jrodolfo.jobportal.exception.ResumeParseException;
import net.jrodolfo.jobportal.exception.StaleResumeMessageException;
import net.jrodolfo.jobportal.messaging.ResumeMessagingConstants;
import net.jrodolfo.jobportal.messaging.ResumeParseMessage;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import net.jrodolfo.jobportal.storage.ResumeStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResumeParseProcessorTest {

    @Mock
    private ResumeRepository resumeRepository;
    @Mock
    private ResumeStorage resumeStorage;
    @Mock
    private ResumeTextExtractor textExtractor;

    private ResumeParseProcessor processor;

    @BeforeEach
    void setUp() {
        processor = new ResumeParseProcessor(
                resumeRepository, resumeStorage, textExtractor, new NoOpTransactionManager(), 3
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {
            ResumeFileValidator.PDF_CONTENT_TYPE,
            ResumeFileValidator.DOCX_CONTENT_TYPE
    })
    void parsesCanonicalResumeTypesAndPersistsSuccess(String contentType) {
        Resume resume = resume(contentType);
        ByteArrayResource resource = new ByteArrayResource("content".getBytes());
        when(resumeRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(resume));
        when(resumeStorage.load(resume.getStorageKey())).thenReturn(resource);
        when(textExtractor.extract(resource, contentType)).thenReturn("Normalized resume text");

        processor.process(message(10L));

        assertEquals(ResumeParseStatus.SUCCEEDED, resume.getParseStatus());
        assertEquals("Normalized resume text", resume.getExtractedText());
        assertNotNull(resume.getParsedAt());
        verify(resumeRepository).saveAndFlush(resume);
    }

    @Test
    void succeededDuplicateIsAcknowledgedWithoutExtractingAgain() {
        Resume resume = resume(ResumeFileValidator.PDF_CONTENT_TYPE);
        resume.setParseStatus(ResumeParseStatus.SUCCEEDED);
        when(resumeRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(resume));

        processor.process(message(10L));

        verifyNoInteractions(resumeStorage, textExtractor);
        verify(resumeRepository, never()).saveAndFlush(resume);
    }

    @Test
    void eachRealFailureIncrementsAttemptsAndThirdFailureBecomesTerminal() {
        Resume resume = resume(ResumeFileValidator.PDF_CONTENT_TYPE);
        ByteArrayResource resource = new ByteArrayResource("content".getBytes());
        when(resumeRepository.findByIdForUpdate(10L)).thenReturn(Optional.of(resume));
        when(resumeStorage.load(resume.getStorageKey())).thenReturn(resource);
        when(textExtractor.extract(resource, resume.getContentType()))
                .thenThrow(new ResumeParseException("PARSE_ERROR", "Resume text extraction failed"));

        assertThrows(ResumeParseException.class, () -> processor.process(message(10L)));
        assertEquals(1, resume.getParseAttempts());
        assertEquals(ResumeParseStatus.QUEUED, resume.getParseStatus());

        assertThrows(ResumeParseException.class, () -> processor.process(message(10L)));
        assertEquals(2, resume.getParseAttempts());
        assertEquals(ResumeParseStatus.QUEUED, resume.getParseStatus());

        assertThrows(ResumeParseException.class, () -> processor.process(message(10L)));
        assertEquals(3, resume.getParseAttempts());
        assertEquals(ResumeParseStatus.FAILED, resume.getParseStatus());
        assertEquals("PARSE_ERROR", resume.getErrorCode());
    }

    @Test
    void staleResumeMessageStopsWithoutExtraction() {
        when(resumeRepository.findByIdForUpdate(404L)).thenReturn(Optional.empty());

        assertThrows(StaleResumeMessageException.class, () -> processor.process(message(404L)));

        verifyNoInteractions(resumeStorage, textExtractor);
    }

    @Test
    void malformedSchemaStopsBeforeDatabaseLookup() {
        ResumeParseMessage malformed = new ResumeParseMessage("event", 10L, "OTHER_EVENT", 99);

        assertThrows(StaleResumeMessageException.class, () -> processor.process(malformed));

        verifyNoInteractions(resumeRepository, resumeStorage, textExtractor);
    }

    private ResumeParseMessage message(Long resumeId) {
        return new ResumeParseMessage(
                "11111111-1111-1111-1111-111111111111",
                resumeId,
                ResumeMessagingConstants.EVENT_TYPE,
                ResumeMessagingConstants.SCHEMA_VERSION
        );
    }

    private Resume resume(String contentType) {
        Resume resume = new Resume();
        resume.setId(10L);
        resume.setStorageKey("11111111-1111-1111-1111-111111111111.pdf");
        resume.setContentType(contentType);
        resume.setParseStatus(ResumeParseStatus.QUEUED);
        return resume;
    }

    private static final class NoOpTransactionManager extends AbstractPlatformTransactionManager {
        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
        }
    }
}
