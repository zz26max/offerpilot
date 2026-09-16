package net.jrodolfo.jobportal.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import net.jrodolfo.jobportal.constant.ResumeParseStatus;
import net.jrodolfo.jobportal.constant.JobStatus;
import net.jrodolfo.jobportal.model.Job;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.repository.JobRepository;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import net.jrodolfo.jobportal.repository.ResumeOutboxRepository;
import net.jrodolfo.jobportal.repository.UserRepository;
import net.jrodolfo.jobportal.service.ResumeFileValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static net.jrodolfo.jobportal.service.ResumeFileValidatorTest.docxBytes;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ResumeApiIntegrationTest {

    @TempDir
    static Path resumeStorageRoot;

    @DynamicPropertySource
    static void configureResumeStorage(DynamicPropertyRegistry registry) {
        registry.add("resume.storage.root", resumeStorageRoot::toString);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ResumeRepository resumeRepository;

    @Autowired
    private ResumeOutboxRepository outboxRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JobRepository jobRepository;

    private final List<Long> matchTestJobIds = new ArrayList<>();

    @BeforeEach
    void deleteResumeMetadata() {
        outboxRepository.deleteAll();
        resumeRepository.deleteAll();
    }

    @AfterEach
    void deleteMatchTestJobs() {
        jobRepository.deleteAllById(matchTestJobIds);
        matchTestJobIds.clear();
    }

    @Test
    void applicantCanMatchOwnParsedResumeAgainstOpenJobsWithoutSensitiveFields() throws Exception {
        Resume parsedResume = resumeRepository.saveAndFlush(parsedResume(
                ResumeParseStatus.SUCCEEDED,
                "JAVA, springboot and Docker"
        ));
        Job open = saveMatchJob("OfferPilot match open", "Java Spring Boot Kubernetes", JobStatus.OPEN);
        saveMatchJob("OfferPilot match closed", "Java Docker", JobStatus.CLOSED);

        String body = mockMvc.perform(get("/api/resumes/{id}/matches", parsedResume.getId())
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.algorithmVersion").value("technical-skills-v1"))
                .andExpect(jsonPath("$.resumeId").value(parsedResume.getId()))
                .andExpect(jsonPath("$.resumeSkills").isArray())
                .andExpect(jsonPath("$.storageKey").doesNotExist())
                .andExpect(jsonPath("$.sha256").doesNotExist())
                .andExpect(jsonPath("$.extractedText").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        JsonNode response = objectMapper.readTree(body);
        JsonNode openMatch = findJobMatch(response, "OfferPilot match open");
        assertEquals(open.getId(), openMatch.get("id").asLong());
        assertEquals(67, openMatch.get("score").asInt());
        assertEquals(true, openMatch.get("comparable").asBoolean());
        assertEquals(List.of("Java", "Spring Boot"), objectMapper.convertValue(
                openMatch.get("matchedSkills"),
                objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)
        ));
        assertEquals(List.of("Kubernetes"), objectMapper.convertValue(
                openMatch.get("missingSkills"),
                objectMapper.getTypeFactory().constructCollectionType(List.class, String.class)
        ));
        assertFalse(response.get("jobs").findValuesAsText("title").contains("OfferPilot match closed"));
        assertFalse(body.contains("JAVA, springboot and Docker"));
        assertFalse(body.contains("\"storageKey\""));
        assertFalse(body.contains("\"sha256\""));
        assertFalse(body.contains("\"extractedText\""));

        mockMvc.perform(get("/api/resumes/{id}/matches", parsedResume.getId())
                        .with(user("other@applicant.test").roles("APPLICANT")))
                .andExpect(status().isNotFound());
    }

    @Test
    void matchingRequiresSuccessfullyParsedNonBlankText() throws Exception {
        Resume queuedResume = resumeRepository.saveAndFlush(parsedResume(ResumeParseStatus.QUEUED, null));

        mockMvc.perform(get("/api/resumes/{id}/matches", queuedResume.getId())
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message")
                        .value("Resume matching requires successfully parsed resume text"))
                .andExpect(jsonPath("$.timestamp").isNumber());
    }

    @Test
    void applicantCanUploadListAndDownloadOwnPdfButAnotherApplicantGetsNotFound() throws Exception {
        byte[] pdf = "%PDF-1.7\nOfferPilot resume".getBytes();
        MockMultipartFile upload = new MockMultipartFile("file", "简历.pdf", "text/plain", pdf);

        String responseBody = mockMvc.perform(multipart("/api/resumes")
                        .file(upload)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.originalFilename").value("简历.pdf"))
                .andExpect(jsonPath("$.contentType").value(ResumeFileValidator.PDF_CONTENT_TYPE))
                .andExpect(jsonPath("$.sizeBytes").value(pdf.length))
                .andExpect(jsonPath("$.sha256").value("9e71ab1984528e0b81d8d799687fdf121592c0d1045c4d80438e0bb7691c811b"))
                .andExpect(jsonPath("$.parseStatus").value("QUEUED"))
                .andExpect(jsonPath("$.attempts").value(0))
                .andExpect(jsonPath("$.storageKey").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        JsonNode uploaded = objectMapper.readTree(responseBody);
        long resumeId = uploaded.get("id").asLong();
        assertEquals(1, outboxRepository.count());

        mockMvc.perform(get("/api/resumes/{id}", resumeId)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(resumeId))
                .andExpect(jsonPath("$.parseStatus").value("QUEUED"))
                .andExpect(jsonPath("$.extractedText").isEmpty())
                .andExpect(jsonPath("$.storageKey").doesNotExist())
                .andExpect(jsonPath("$.errorSummary").doesNotExist());

        Resume parsed = resumeRepository.findById(resumeId).orElseThrow();
        parsed.setParseStatus(ResumeParseStatus.SUCCEEDED);
        parsed.setExtractedText("Normalized extracted resume text");
        parsed.setParsedAt(LocalDateTime.now());
        parsed.setErrorSummary("internal parser diagnostic");
        resumeRepository.saveAndFlush(parsed);

        mockMvc.perform(get("/api/resumes/{id}", resumeId)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parseStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.extractedText").value("Normalized extracted resume text"))
                .andExpect(jsonPath("$.parsedAt").isNotEmpty())
                .andExpect(jsonPath("$.storageKey").doesNotExist())
                .andExpect(jsonPath("$.errorSummary").doesNotExist());

        mockMvc.perform(get("/api/resumes/{id}", resumeId)
                        .with(user("other@applicant.test").roles("APPLICANT")))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/resumes").with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(resumeId))
                .andExpect(jsonPath("$[0].storageKey").doesNotExist());

        mockMvc.perform(get("/api/resumes/{id}/content", resumeId)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isOk())
                .andExpect(content().bytes(pdf))
                .andExpect(content().contentType(ResumeFileValidator.PDF_CONTENT_TYPE))
                .andExpect(header().string("Content-Disposition", containsString("attachment")));

        mockMvc.perform(get("/api/resumes/{id}/content", resumeId)
                        .with(user("other@applicant.test").roles("APPLICANT")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Resume with id " + resumeId + " was not found"));
    }

    @Test
    void validDocxIsAcceptedEvenWhenDeclaredContentTypeIsGeneric() throws Exception {
        MockMultipartFile upload = new MockMultipartFile(
                "file", "resume.docx", MediaType.APPLICATION_OCTET_STREAM_VALUE, docxBytes(true, true)
        );

        mockMvc.perform(multipart("/api/resumes")
                        .file(upload)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contentType").value(ResumeFileValidator.DOCX_CONTENT_TYPE));
    }

    @Test
    void forgedAndEmptyFilesReturnSafeClientErrors() throws Exception {
        MockMultipartFile forged = new MockMultipartFile(
                "file", "resume.pdf", MediaType.APPLICATION_PDF_VALUE, "plain text".getBytes()
        );
        mockMvc.perform(multipart("/api/resumes")
                        .file(forged)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("Only valid PDF or DOCX resume files are allowed"));

        MockMultipartFile empty = new MockMultipartFile("file", "resume.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[0]);
        mockMvc.perform(multipart("/api/resumes")
                        .file(empty)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Resume file must not be empty"));
    }

    @Test
    void oversizedMultipartUploadReturnsStandardPayloadTooLargeErrorWithoutMetadata() throws Exception {
        byte[] oversized = new byte[(5 * 1024 * 1024) + 1];
        MockMultipartFile upload = new MockMultipartFile(
                "file", "resume.pdf", MediaType.APPLICATION_PDF_VALUE, oversized
        );

        assertEquals(0, resumeRepository.count());
        mockMvc.perform(multipart("/api/resumes")
                        .file(upload)
                        .with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.status").value(413))
                .andExpect(jsonPath("$.message").value("Resume file must not exceed 5 MiB"))
                .andExpect(jsonPath("$.timestamp").isNumber());
        assertEquals(0, resumeRepository.count());
    }

    @Test
    void resumeEndpointsRequireApplicantRole() throws Exception {
        mockMvc.perform(get("/api/resumes"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(get("/api/resumes").with(httpBasic("admin@local.test", "admin123")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));

        mockMvc.perform(get("/api/resumes").with(httpBasic("user@local.test", "user123")))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/resumes/1/matches"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(get("/api/resumes/1/matches").with(httpBasic("admin@local.test", "admin123")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void flywayCreatesResumeParsingColumnsAndOutboxIndex() {
        Integer tableCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RESUMES'",
                Integer.class
        );
        Integer indexCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.INDEXES WHERE TABLE_NAME = 'RESUMES' AND INDEX_NAME = 'IDX_RESUMES_USER_ID'",
                Integer.class
        );
        Integer outboxCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RESUME_OUTBOX'",
                Integer.class
        );
        Integer pendingIndexCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.INDEXES WHERE TABLE_NAME = 'RESUME_OUTBOX' AND INDEX_NAME = 'IDX_RESUME_OUTBOX_PENDING'",
                Integer.class
        );
        Integer parseStatusColumnCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RESUMES' AND COLUMN_NAME = 'PARSE_STATUS'",
                Integer.class
        );

        assertEquals(1, tableCount);
        assertEquals(1, indexCount);
        assertEquals(1, outboxCount);
        assertEquals(1, pendingIndexCount);
        assertEquals(1, parseStatusColumnCount);
    }

    @Test
    void migratedResumeRowsDefaultToUploadedWithoutInventingOutboxEvents() {
        Long ownerId = jdbcTemplate.queryForObject(
                "SELECT id FROM users WHERE email = ?",
                Long.class,
                "user@local.test"
        );
        jdbcTemplate.update("""
                        INSERT INTO resumes (
                            user_id, original_filename, storage_key, content_type,
                            size_bytes, sha256, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6))
                        """,
                ownerId,
                "legacy.pdf",
                "22222222-2222-2222-2222-222222222222.pdf",
                ResumeFileValidator.PDF_CONTENT_TYPE,
                12,
                "a".repeat(64)
        );

        String status = jdbcTemplate.queryForObject(
                "SELECT parse_status FROM resumes WHERE storage_key = ?",
                String.class,
                "22222222-2222-2222-2222-222222222222.pdf"
        );
        Integer attempts = jdbcTemplate.queryForObject(
                "SELECT parse_attempts FROM resumes WHERE storage_key = ?",
                Integer.class,
                "22222222-2222-2222-2222-222222222222.pdf"
        );

        assertEquals("UPLOADED", status);
        assertEquals(0, attempts);
        assertEquals(0, outboxRepository.count());
    }

    @Test
    void extractedTextMappingPersistsAndReadsTheFullConfiguredMaximum() {
        String maximumText = "简".repeat(100_000);
        Resume resume = new Resume(
                userRepository.findByEmailIgnoreCase("user@local.test").orElseThrow(),
                "maximum.pdf",
                "33333333-3333-3333-3333-333333333333.pdf",
                ResumeFileValidator.PDF_CONTENT_TYPE,
                12,
                "b".repeat(64)
        );
        resume.setParseStatus(ResumeParseStatus.SUCCEEDED);
        resume.setExtractedText(maximumText);

        Resume saved = resumeRepository.saveAndFlush(resume);
        Resume reloaded = resumeRepository.findById(saved.getId()).orElseThrow();

        assertEquals(100_000, reloaded.getExtractedText().length());
        assertEquals(maximumText, reloaded.getExtractedText());
        assertEquals(100_000, jdbcTemplate.queryForObject(
                "SELECT CHAR_LENGTH(extracted_text) FROM resumes WHERE id = ?",
                Integer.class,
                saved.getId()
        ));
    }

    private Resume parsedResume(ResumeParseStatus status, String extractedText) {
        Resume resume = new Resume(
                userRepository.findByEmailIgnoreCase("user@local.test").orElseThrow(),
                "match-test.pdf",
                UUID.randomUUID() + ".pdf",
                ResumeFileValidator.PDF_CONTENT_TYPE,
                12,
                "c".repeat(64)
        );
        resume.setParseStatus(status);
        resume.setExtractedText(extractedText);
        return resume;
    }

    private Job saveMatchJob(String title, String description, JobStatus status) {
        Job job = new Job(title, description, "Match Test Company");
        job.setStatus(status);
        Job saved = jobRepository.saveAndFlush(job);
        matchTestJobIds.add(saved.getId());
        return saved;
    }

    private JsonNode findJobMatch(JsonNode response, String title) {
        for (JsonNode match : response.path("jobs")) {
            if (title.equals(match.path("title").asText())) {
                return match;
            }
        }
        throw new AssertionError("Expected job match was not returned: " + title);
    }
}
