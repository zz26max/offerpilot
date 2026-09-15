package net.jrodolfo.jobportal.messaging;

public record ResumeParseMessage(
        String eventId,
        Long resumeId,
        String eventType,
        int schemaVersion
) {
}
