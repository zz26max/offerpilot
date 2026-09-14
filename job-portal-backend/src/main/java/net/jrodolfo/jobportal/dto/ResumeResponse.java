package net.jrodolfo.jobportal.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import net.jrodolfo.jobportal.model.Resume;

import java.time.LocalDateTime;

@Schema(description = "Resume metadata. Internal storage details are never exposed.")
public record ResumeResponse(
        Long id,
        String originalFilename,
        String contentType,
        long sizeBytes,
        String sha256,
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
                resume.getCreatedAt(),
                resume.getUpdatedAt()
        );
    }
}
