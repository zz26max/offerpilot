package net.jrodolfo.jobportal.storage;

import net.jrodolfo.jobportal.exception.ResumeStorageException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
public class LocalResumeStorage implements ResumeStorage {

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("pdf", "docx");
    private static final Pattern STORAGE_KEY_PATTERN = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(pdf|docx)"
    );

    private final Path root;

    public LocalResumeStorage(@Value("${resume.storage.root:./data/resumes}") String configuredRoot) {
        this.root = Path.of(configuredRoot).toAbsolutePath().normalize();
    }

    @Override
    public String store(byte[] content, String extension) {
        String normalizedExtension = extension == null ? "" : extension.toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXTENSIONS.contains(normalizedExtension)) {
            throw new ResumeStorageException("Unsupported storage file type");
        }

        String id = UUID.randomUUID().toString();
        String storageKey = id + "." + normalizedExtension;
        Path target = resolve(storageKey);
        Path temporary = resolve(id + ".tmp");

        try {
            Files.createDirectories(root);
            Files.write(temporary, content, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            try {
                Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ex) {
                Files.move(temporary, target);
            }
            return storageKey;
        } catch (IOException ex) {
            deleteTemporaryFile(temporary);
            throw new ResumeStorageException("Unable to store resume file", ex);
        }
    }

    @Override
    public Resource load(String storageKey) {
        Path path = resolveExistingStorageKey(storageKey);
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)) {
            throw new ResumeStorageException("Resume content is unavailable");
        }
        return new FileSystemResource(path);
    }

    @Override
    public void delete(String storageKey) {
        Path path = resolveExistingStorageKey(storageKey);
        try {
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            throw new ResumeStorageException("Unable to remove resume file", ex);
        }
    }

    private Path resolveExistingStorageKey(String storageKey) {
        if (storageKey == null || !STORAGE_KEY_PATTERN.matcher(storageKey).matches()) {
            throw new ResumeStorageException("Invalid resume storage key");
        }
        return resolve(storageKey);
    }

    private Path resolve(String storageKey) {
        Path resolved = root.resolve(storageKey).normalize();
        if (!resolved.startsWith(root)) {
            throw new ResumeStorageException("Invalid resume storage key");
        }
        return resolved;
    }

    private void deleteTemporaryFile(Path temporary) {
        try {
            Files.deleteIfExists(temporary);
        } catch (IOException ignored) {
            // The original storage failure remains the actionable exception.
        }
    }
}
