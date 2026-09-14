package net.jrodolfo.jobportal.dto;

import org.springframework.core.io.Resource;

public record ResumeDownload(
        String originalFilename,
        String contentType,
        long sizeBytes,
        Resource resource
) {
}
