package net.jrodolfo.jobportal.exception;

public class ResumeParseException extends RuntimeException {

    private final String errorCode;
    private final String safeSummary;

    public ResumeParseException(String errorCode, String safeSummary) {
        super(safeSummary);
        this.errorCode = errorCode;
        this.safeSummary = safeSummary;
    }

    public ResumeParseException(String errorCode, String safeSummary, Throwable cause) {
        super(safeSummary, cause);
        this.errorCode = errorCode;
        this.safeSummary = safeSummary;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public String getSafeSummary() {
        return safeSummary;
    }
}
