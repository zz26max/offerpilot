package net.jrodolfo.jobportal.messaging;

public final class ResumeMessagingConstants {

    public static final String EVENT_TYPE = "RESUME_PARSE_REQUESTED";
    public static final int SCHEMA_VERSION = 1;
    public static final String EXCHANGE = "offerpilot.resume.parse";
    public static final String ROUTING_KEY = "resume.parse.v1";
    public static final String QUEUE = "offerpilot.resume.parse.v1";
    public static final String DEAD_LETTER_EXCHANGE = "offerpilot.resume.parse.dlx";
    public static final String DEAD_LETTER_ROUTING_KEY = "resume.parse.failed.v1";
    public static final String DEAD_LETTER_QUEUE = "offerpilot.resume.parse.failed.v1";

    private ResumeMessagingConstants() {
    }
}
