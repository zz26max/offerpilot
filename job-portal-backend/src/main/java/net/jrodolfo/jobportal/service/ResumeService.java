package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.dto.ResumeDownload;
import net.jrodolfo.jobportal.dto.ResumeResponse;
import net.jrodolfo.jobportal.exception.ResourceException;
import net.jrodolfo.jobportal.exception.ResumeStorageException;
import net.jrodolfo.jobportal.exception.ResumeTooLargeException;
import net.jrodolfo.jobportal.exception.ResumeValidationException;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.model.User;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import net.jrodolfo.jobportal.repository.UserRepository;
import net.jrodolfo.jobportal.storage.ResumeStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

@Service
public class ResumeService {

    static final long MAX_FILE_SIZE_BYTES = 5L * 1024 * 1024;

    private static final Logger log = LoggerFactory.getLogger(ResumeService.class);

    private final UserRepository userRepository;
    private final ResumeRepository resumeRepository;
    private final ResumeStorage resumeStorage;
    private final ResumeFileValidator fileValidator;

    public ResumeService(UserRepository userRepository,
                         ResumeRepository resumeRepository,
                         ResumeStorage resumeStorage,
                         ResumeFileValidator fileValidator) {
        this.userRepository = userRepository;
        this.resumeRepository = resumeRepository;
        this.resumeStorage = resumeStorage;
        this.fileValidator = fileValidator;
    }

    public ResumeResponse upload(String email, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResumeValidationException("Resume file must not be empty");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw tooLarge();
        }

        byte[] content = readContent(file);
        if (content.length == 0) {
            throw new ResumeValidationException("Resume file must not be empty");
        }
        if (content.length > MAX_FILE_SIZE_BYTES) {
            throw tooLarge();
        }

        ResumeFileValidator.ValidatedResumeFile validated =
                fileValidator.validate(file.getOriginalFilename(), content);
        User owner = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ResourceException("Applicant account was not found"));
        String originalFilename = sanitizeFilename(file.getOriginalFilename(), validated.extension());
        String storageKey = resumeStorage.store(content, validated.extension());

        Resume resume = new Resume(
                owner,
                originalFilename,
                storageKey,
                validated.contentType(),
                content.length,
                sha256(content)
        );
        Resume saved;
        try {
            saved = resumeRepository.saveAndFlush(resume);
        } catch (RuntimeException databaseFailure) {
            compensateStoredFile(storageKey, databaseFailure);
            throw databaseFailure;
        }
        return ResumeResponse.from(saved);
    }

    public List<ResumeResponse> listOwn(String email) {
        return resumeRepository.findByUser_EmailIgnoreCaseOrderByCreatedAtDescIdDesc(email)
                .stream()
                .map(ResumeResponse::from)
                .toList();
    }

    public ResumeDownload downloadOwn(Long id, String email) {
        Resume resume = resumeRepository.findByIdAndUser_EmailIgnoreCase(id, email)
                .orElseThrow(() -> new ResourceException("Resume with id " + id + " was not found"));
        return new ResumeDownload(
                resume.getOriginalFilename(),
                resume.getContentType(),
                resume.getSizeBytes(),
                resumeStorage.load(resume.getStorageKey())
        );
    }

    private byte[] readContent(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new ResumeStorageException("Unable to read uploaded resume", ex);
        }
    }

    private String sanitizeFilename(String originalFilename, String extension) {
        String filename = originalFilename == null ? "" : originalFilename.replace('\\', '/');
        int lastSeparator = filename.lastIndexOf('/');
        if (lastSeparator >= 0) {
            filename = filename.substring(lastSeparator + 1);
        }
        filename = filename.replaceAll("[\\p{Cntrl}]", "_").trim();
        if (filename.isBlank()) {
            filename = "resume." + extension;
        }
        if (filename.length() > 255) {
            String suffix = "." + extension;
            filename = filename.substring(0, 255 - suffix.length()) + suffix;
        }
        return filename;
    }

    private String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private ResumeTooLargeException tooLarge() {
        return new ResumeTooLargeException("Resume file must not exceed 5 MiB");
    }

    private void compensateStoredFile(String storageKey, RuntimeException databaseFailure) {
        try {
            resumeStorage.delete(storageKey);
        } catch (RuntimeException cleanupFailure) {
            databaseFailure.addSuppressed(cleanupFailure);
            log.error("Failed to remove stored resume after database write failure", cleanupFailure);
        }
    }
}
