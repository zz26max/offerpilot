package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.exception.ResumeParseException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.openxml4j.opc.PackagePart;
import org.apache.poi.openxml4j.opc.PackagePartName;
import org.apache.poi.openxml4j.opc.PackagingURIHelper;
import org.apache.poi.openxml4j.opc.TargetMode;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TikaResumeTextExtractorTest {

    @Test
    void extractsPdfTextWithoutOcr() throws IOException {
        TikaResumeTextExtractor extractor = new TikaResumeTextExtractor(100_000);

        String text = extractor.extract(new ByteArrayResource(pdf("OfferPilot PDF resume")),
                ResumeFileValidator.PDF_CONTENT_TYPE);

        assertTrue(text.contains("OfferPilot PDF resume"));
    }

    @Test
    void extractsDocxTextAndNormalizesOuterWhitespace() throws Exception {
        TikaResumeTextExtractor extractor = new TikaResumeTextExtractor(100_000);

        String text = extractor.extract(new ByteArrayResource(docx("  OfferPilot DOCX resume  ", null)),
                ResumeFileValidator.DOCX_CONTENT_TYPE);

        assertTrue(text.startsWith("OfferPilot DOCX resume"));
        assertFalse(text.endsWith(" "));
    }

    @Test
    void capsExtractedOutputAtConfiguredCharacterLimit() throws Exception {
        TikaResumeTextExtractor extractor = new TikaResumeTextExtractor(64);

        String text = extractor.extract(new ByteArrayResource(docx("x".repeat(2_000), null)),
                ResumeFileValidator.DOCX_CONTENT_TYPE);

        assertTrue(text.length() <= 64);
    }

    @Test
    void ignoresEmbeddedDocumentContent() throws Exception {
        TikaResumeTextExtractor extractor = new TikaResumeTextExtractor(100_000);

        String text = extractor.extract(
                new ByteArrayResource(docx("Visible resume", "EMBEDDED-SECRET-CONTENT")),
                ResumeFileValidator.DOCX_CONTENT_TYPE
        );

        assertTrue(text.contains("Visible resume"));
        assertFalse(text.contains("EMBEDDED-SECRET-CONTENT"));
    }

    @Test
    void rejectsNonCanonicalStoredContentType() {
        TikaResumeTextExtractor extractor = new TikaResumeTextExtractor(100_000);

        assertThrows(ResumeParseException.class,
                () -> extractor.extract(new ByteArrayResource("text".getBytes()), "text/plain"));
    }

    private byte[] pdf(String text) throws IOException {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(72, 720);
                content.showText(text);
                content.endText();
            }
            document.save(output);
            return output.toByteArray();
        }
    }

    private byte[] docx(String visibleText, String embeddedText) throws Exception {
        try (XWPFDocument document = new XWPFDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            document.createParagraph().createRun().setText(visibleText);
            if (embeddedText != null) {
                PackagePartName partName = PackagingURIHelper.createPartName("/word/embeddings/secret.txt");
                PackagePart embeddedPart = document.getPackage().createPart(partName, "text/plain");
                try (var stream = embeddedPart.getOutputStream()) {
                    stream.write(embeddedText.getBytes());
                }
                document.getPackagePart().addRelationship(
                        partName,
                        TargetMode.INTERNAL,
                        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package"
                );
            }
            document.write(output);
            return output.toByteArray();
        }
    }
}
