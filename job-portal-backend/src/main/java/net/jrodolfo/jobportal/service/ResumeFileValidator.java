package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.exception.ResumeValidationException;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Component
public class ResumeFileValidator {

    public static final String PDF_CONTENT_TYPE = "application/pdf";
    public static final String DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private static final byte[] PDF_SIGNATURE = "%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final String CONTENT_TYPES_ENTRY = "[Content_Types].xml";
    private static final String DOCUMENT_ENTRY = "word/document.xml";
    static final long MAX_SCANNED_UNCOMPRESSED_BYTES = 64L * 1024 * 1024;
    static final int MAX_ZIP_ENTRIES = 2048;

    public ValidatedResumeFile validate(String originalFilename, byte[] content) {
        if (startsWith(content, PDF_SIGNATURE)) {
            requireFilenameExtension(originalFilename, "pdf");
            return new ValidatedResumeFile(PDF_CONTENT_TYPE, "pdf");
        }
        if (isDocx(content)) {
            requireFilenameExtension(originalFilename, "docx");
            return new ValidatedResumeFile(DOCX_CONTENT_TYPE, "docx");
        }
        throw invalidType();
    }

    private boolean isDocx(byte[] content) {
        if (content.length < 4 || content[0] != 'P' || content[1] != 'K') {
            return false;
        }

        boolean contentTypesFound = false;
        boolean documentFound = false;
        long scannedBytes = 0;
        int entryCount = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(content))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > MAX_ZIP_ENTRIES) {
                    return false;
                }
                if (CONTENT_TYPES_ENTRY.equals(entry.getName()) && !entry.isDirectory()) {
                    contentTypesFound = true;
                }
                if (DOCUMENT_ENTRY.equals(entry.getName()) && !entry.isDirectory()) {
                    documentFound = true;
                }
                scannedBytes = drainEntry(zip, scannedBytes);
                if (scannedBytes < 0) {
                    return false;
                }
            }
        } catch (IOException | RuntimeException ex) {
            return false;
        }
        return contentTypesFound && documentFound;
    }

    private long drainEntry(ZipInputStream zip, long scannedBytes) throws IOException {
        byte[] buffer = new byte[8192];
        int read;
        while ((read = zip.read(buffer)) != -1) {
            scannedBytes += read;
            if (scannedBytes > MAX_SCANNED_UNCOMPRESSED_BYTES) {
                return -1;
            }
        }
        return scannedBytes;
    }

    private boolean startsWith(byte[] content, byte[] signature) {
        if (content.length < signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if (content[i] != signature[i]) {
                return false;
            }
        }
        return true;
    }

    private void requireFilenameExtension(String originalFilename, String expectedExtension) {
        String filename = originalFilename == null ? "" : originalFilename.toLowerCase(Locale.ROOT);
        if (!filename.endsWith("." + expectedExtension)) {
            throw invalidType();
        }
    }

    private ResumeValidationException invalidType() {
        return new ResumeValidationException("Only valid PDF or DOCX resume files are allowed");
    }

    public record ValidatedResumeFile(String contentType, String extension) {
    }
}
