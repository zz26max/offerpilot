package net.jrodolfo.jobportal.exception;

public class ResumeMatchUnavailableException extends RuntimeException {

    public ResumeMatchUnavailableException() {
        super("Resume matching requires successfully parsed resume text");
    }
}
