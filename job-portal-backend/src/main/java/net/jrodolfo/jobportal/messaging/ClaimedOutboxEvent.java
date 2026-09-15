package net.jrodolfo.jobportal.messaging;

public record ClaimedOutboxEvent(
        String eventId,
        Long resumeId,
        String eventType,
        int schemaVersion
) {
    public ResumeParseMessage toMessage() {
        return new ResumeParseMessage(eventId, resumeId, eventType, schemaVersion);
    }
}
