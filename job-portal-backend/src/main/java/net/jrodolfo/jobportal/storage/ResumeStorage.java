package net.jrodolfo.jobportal.storage;

import org.springframework.core.io.Resource;

public interface ResumeStorage {

    String store(byte[] content, String extension);

    Resource load(String storageKey);

    void delete(String storageKey);
}
