package net.jrodolfo.jobportal.storage;

import net.jrodolfo.jobportal.exception.ResumeStorageException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class LocalResumeStorageTest {

    @TempDir
    Path temporaryDirectory;

    @Test
    void storesWithRandomKeysAndLoadsContentInsideConfiguredRoot() throws IOException {
        LocalResumeStorage storage = new LocalResumeStorage(temporaryDirectory.toString());
        byte[] content = "%PDF-1.7\nresume".getBytes();

        String firstKey = storage.store(content, "pdf");
        String secondKey = storage.store(content, "pdf");

        assertNotEquals(firstKey, secondKey);
        assertTrue(firstKey.matches("[0-9a-f-]{36}\\.pdf"));
        assertFalse(firstKey.contains("resume"));
        assertArrayEquals(content, storage.load(firstKey).getInputStream().readAllBytes());
        assertTrue(temporaryDirectory.resolve(firstKey).normalize().startsWith(temporaryDirectory.normalize()));
    }

    @Test
    void rejectsTraversalAndUnsupportedStorageKeys() {
        LocalResumeStorage storage = new LocalResumeStorage(temporaryDirectory.toString());

        assertThrows(ResumeStorageException.class, () -> storage.load("../secret.pdf"));
        assertThrows(ResumeStorageException.class, () -> storage.delete("C:\\secret.pdf"));
        assertThrows(ResumeStorageException.class, () -> storage.store(new byte[]{1}, "exe"));
    }

    @Test
    void loadRejectsSymbolicLinkThatPointsOutsideStorageRoot() throws IOException {
        Path root = temporaryDirectory.resolve("root");
        Path outsideFile = temporaryDirectory.resolve("outside.pdf");
        Files.createDirectories(root);
        Files.writeString(outsideFile, "%PDF-1.7\noutside");
        String storageKey = UUID.randomUUID() + ".pdf";
        Path link = root.resolve(storageKey);
        try {
            Files.createSymbolicLink(link, outsideFile);
        } catch (IOException | UnsupportedOperationException | SecurityException ex) {
            assumeTrue(false, "Symbolic links are not supported by this test environment: " + ex.getMessage());
        }

        LocalResumeStorage storage = new LocalResumeStorage(root.toString());
        assertThrows(ResumeStorageException.class, () -> storage.load(storageKey));

        storage.delete(storageKey);
        assertTrue(Files.exists(outsideFile));
        assertFalse(Files.exists(link, java.nio.file.LinkOption.NOFOLLOW_LINKS));
    }
}
