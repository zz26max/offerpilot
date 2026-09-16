package net.jrodolfo.jobportal.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class ResumeExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void storageFailuresReturnGenericErrorWithoutInternalDetails() {
        var response = handler.handleResumeStorageException(
                new ResumeStorageException("D:\\private\\resumes could not be written")
        );

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        assertEquals("Resume storage is temporarily unavailable", response.getBody().getMessage());
        assertFalse(response.getBody().getMessage().contains("D:\\private"));
    }

    @Test
    void oversizedResumeReturnsPayloadTooLargeErrorResponse() {
        var response = handler.handleResumeTooLargeException(
                new ResumeTooLargeException("client supplied details")
        );

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, response.getStatusCode());
        assertEquals(413, response.getBody().getStatus());
        assertEquals("Resume file must not exceed 5 MiB", response.getBody().getMessage());
    }

    @Test
    void unavailableMatchingReturnsSafeConflictResponse() {
        var response = handler.handleResumeMatchUnavailableException(new ResumeMatchUnavailableException());

        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
        assertEquals(409, response.getBody().getStatus());
        assertEquals("Resume matching requires successfully parsed resume text", response.getBody().getMessage());
    }
}
