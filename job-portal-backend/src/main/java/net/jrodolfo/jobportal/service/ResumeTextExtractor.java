package net.jrodolfo.jobportal.service;

import org.springframework.core.io.Resource;

public interface ResumeTextExtractor {

    String extract(Resource resource, String canonicalContentType);
}
