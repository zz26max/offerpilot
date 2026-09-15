package net.jrodolfo.jobportal.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.constant.ResumeParseStatus;

import java.time.LocalDateTime;

@Schema(description = "Resume metadata. Internal storage details are never exposed.")
public record ResumeResponse(
        Long id,
        String originalFilename,
        String contentType,
        long sizeBytes,
        String sha256,
        ResumeParseStatus parseStatus,
        int attempts,
        LocalDateTime parsedAt,
        String errorCode,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static ResumeResponse from(Resume resume) {
        return new ResumeResponse(
                resume.getId(),
                resume.getOriginalFilename(),
                resume.getContentType(),
                resume.getSizeBytes(),
                resume.getSha256(),
                resume.getParseStatus(),
                resume.getParseAttempts(),
                resume.getParsedAt(),
                resume.getErrorCode(),
                resume.getCreatedAt(),
                resume.getUpdatedAt()
        );
    }
}
