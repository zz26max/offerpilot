package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.exception.ResumeValidationException;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class ResumeFileValidatorTest {

    private final ResumeFileValidator validator = new ResumeFileValidator();

    @Test
    void acceptsPdfBySignatureAndNormalizesContentType() {
        var validated = validator.validate("resume.PDF", "%PDF-1.7\nbody".getBytes());

        assertEquals("pdf", validated.extension());
        assertEquals(ResumeFileValidator.PDF_CONTENT_TYPE, validated.contentType());
    }

    @Test
    void acceptsDocxOnlyWhenRequiredPackageEntriesExist() throws IOException {
        var validated = validator.validate("resume.docx", docxBytes(true, true));

        assertEquals("docx", validated.extension());
        assertEquals(ResumeFileValidator.DOCX_CONTENT_TYPE, validated.contentType());
    }

    @Test
    void rejectsForgedPdfAndDocxFiles() throws IOException {
        assertThrows(ResumeValidationException.class,
                () -> validator.validate("resume.pdf", "not a pdf".getBytes()));
        assertThrows(ResumeValidationException.class,
                () -> validator.validate("resume.docx", docxBytes(true, false)));
        assertThrows(ResumeValidationException.class,
                () -> validator.validate("resume.pdf", docxBytes(true, true)));
    }

    @Test
    void rejectsDocxWhenRequiredEntriesPrecedeOversizedCompressedEntry() throws IOException {
        byte[] compressedDocx = docxWithOversizedTrailingEntry();

        assertThrows(ResumeValidationException.class,
                () -> validator.validate("resume.docx", compressedDocx));
    }

    @Test
    void rejectsDocxWithTooManyZipEntries() throws IOException {
        byte[] crowdedDocx = docxWithTooManyEntries();

        assertThrows(ResumeValidationException.class,
                () -> validator.validate("resume.docx", crowdedDocx));
    }

    public static byte[] docxBytes(boolean includeContentTypes, boolean includeDocument) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            if (includeContentTypes) {
                addEntry(zip, "[Content_Types].xml", "<Types/>");
            }
            if (includeDocument) {
                addEntry(zip, "word/document.xml", "<document/>");
            }
        }
        return output.toByteArray();
    }

    private static void addEntry(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes());
        zip.closeEntry();
    }

    private static byte[] docxWithOversizedTrailingEntry() throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            addEntry(zip, "[Content_Types].xml", "<Types/>");
            addEntry(zip, "word/document.xml", "<document/>");
            zip.putNextEntry(new ZipEntry("word/media/compressed.bin"));
            byte[] repeatedBytes = new byte[8192];
            long bytesToWrite = ResumeFileValidator.MAX_SCANNED_UNCOMPRESSED_BYTES + 1;
            while (bytesToWrite > 0) {
                int chunkSize = (int) Math.min(repeatedBytes.length, bytesToWrite);
                zip.write(repeatedBytes, 0, chunkSize);
                bytesToWrite -= chunkSize;
            }
            zip.closeEntry();
        }
        return output.toByteArray();
    }

    private static byte[] docxWithTooManyEntries() throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            addEntry(zip, "[Content_Types].xml", "<Types/>");
            addEntry(zip, "word/document.xml", "<document/>");
            for (int i = 0; i < ResumeFileValidator.MAX_ZIP_ENTRIES; i++) {
                addEntry(zip, "custom/entry-" + i + ".xml", "");
            }
        }
        return output.toByteArray();
    }
}
