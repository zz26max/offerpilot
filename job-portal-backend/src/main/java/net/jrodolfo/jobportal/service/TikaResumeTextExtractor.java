package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.exception.ResumeParseException;
import org.apache.tika.extractor.EmbeddedDocumentExtractor;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.parser.Parser;
import org.apache.tika.parser.microsoft.ooxml.OOXMLParser;
import org.apache.tika.parser.pdf.PDFParser;
import org.apache.tika.parser.pdf.PDFParserConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.xml.sax.ContentHandler;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

import java.io.IOException;
import java.io.InputStream;

@Component
public class TikaResumeTextExtractor implements ResumeTextExtractor {

    public static final int HARD_MAX_CHARACTERS = 100_000;

    private final int maximumCharacters;

    public TikaResumeTextExtractor(@Value("${resume.processing.extractor.max-characters:100000}") int maximumCharacters) {
        if (maximumCharacters < 1 || maximumCharacters > HARD_MAX_CHARACTERS) {
            throw new IllegalArgumentException("Resume text limit must be between 1 and 100000 characters");
        }
        this.maximumCharacters = maximumCharacters;
    }

    @Override
    public String extract(Resource resource, String canonicalContentType) {
        Parser parser = parserFor(canonicalContentType);
        BoundedTextHandler handler = new BoundedTextHandler(maximumCharacters);
        ParseContext context = secureParseContext(canonicalContentType);
        Metadata metadata = new Metadata();
        metadata.set(Metadata.CONTENT_TYPE, canonicalContentType);

        try (InputStream input = resource.getInputStream()) {
            parser.parse(input, handler, metadata, context);
            return normalize(handler.text());
        } catch (IOException | SAXException | org.apache.tika.exception.TikaException ex) {
            throw new ResumeParseException("PARSE_ERROR", "Resume text extraction failed", ex);
        }
    }

    private Parser parserFor(String canonicalContentType) {
        if (ResumeFileValidator.PDF_CONTENT_TYPE.equals(canonicalContentType)) {
            return new PDFParser();
        }
        if (ResumeFileValidator.DOCX_CONTENT_TYPE.equals(canonicalContentType)) {
            return new OOXMLParser();
        }
        throw new ResumeParseException("UNSUPPORTED_TYPE", "Stored resume content type is unsupported");
    }

    private ParseContext secureParseContext(String canonicalContentType) {
        ParseContext context = new ParseContext();
        context.set(EmbeddedDocumentExtractor.class, new EmbeddedDocumentExtractor() {
            @Override
            public boolean shouldParseEmbedded(Metadata metadata) {
                return false;
            }

            @Override
            public void parseEmbedded(InputStream stream,
                                      ContentHandler handler,
                                      Metadata metadata,
                                      boolean outputHtml) {
                // Embedded files and attachments are deliberately ignored.
            }
        });
        if (ResumeFileValidator.PDF_CONTENT_TYPE.equals(canonicalContentType)) {
            PDFParserConfig pdfConfig = new PDFParserConfig();
            pdfConfig.setOcrStrategy(PDFParserConfig.OCR_STRATEGY.NO_OCR);
            context.set(PDFParserConfig.class, pdfConfig);
        }
        return context;
    }

    private String normalize(String text) {
        return text.replace("\r\n", "\n")
                .replace('\r', '\n')
                .strip();
    }

    private static final class BoundedTextHandler extends DefaultHandler {

        private final StringBuilder text;
        private final int maximumCharacters;

        private BoundedTextHandler(int maximumCharacters) {
            this.maximumCharacters = maximumCharacters;
            this.text = new StringBuilder(Math.min(maximumCharacters, 8192));
        }

        @Override
        public void characters(char[] characters, int start, int length) {
            int remaining = maximumCharacters - text.length();
            if (remaining > 0) {
                text.append(characters, start, Math.min(length, remaining));
            }
        }

        private String text() {
            return text.toString();
        }
    }
}
