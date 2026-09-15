package net.jrodolfo.jobportal.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import net.jrodolfo.jobportal.constant.ResumeParseStatus;
import net.jrodolfo.jobportal.model.Resume;

import java.time.LocalDateTime;

@Schema(description = "Owner-visible resume details and extracted text.")
public record ResumeDetailResponse(
        Long id,
        String originalFilename,
        String contentType,
        long sizeBytes,
        String sha256,
        ResumeParseStatus parseStatus,
        int attempts,
        LocalDateTime parsedAt,
        String errorCode,
        String extractedText,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static ResumeDetailResponse from(Resume resume) {
        return new ResumeDetailResponse(
                resume.getId(),
                resume.getOriginalFilename(),
                resume.getContentType(),
                resume.getSizeBytes(),
                resume.getSha256(),
                resume.getParseStatus(),
                resume.getParseAttempts(),
                resume.getParsedAt(),
                resume.getErrorCode(),
                resume.getExtractedText(),
                resume.getCreatedAt(),
                resume.getUpdatedAt()
        );
    }
}
