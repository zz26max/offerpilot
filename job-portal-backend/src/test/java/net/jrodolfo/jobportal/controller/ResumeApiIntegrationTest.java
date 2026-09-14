package net.jrodolfo.jobportal.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import net.jrodolfo.jobportal.service.ResumeFileValidator;
import org.junit.jupiter.api.BeforeEach;
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

import static net.jrodolfo.jobportal.service.ResumeFileValidatorTest.docxBytes;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
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
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void deleteResumeMetadata() {
        resumeRepository.deleteAll();
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
                .andExpect(jsonPath("$.storageKey").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        JsonNode uploaded = objectMapper.readTree(responseBody);
        long resumeId = uploaded.get("id").asLong();

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
    }

    @Test
    void flywayCreatesResumeTableAndOwnerIndex() {
        Integer tableCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RESUMES'",
                Integer.class
        );
        Integer indexCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.INDEXES WHERE TABLE_NAME = 'RESUMES' AND INDEX_NAME = 'IDX_RESUMES_USER_ID'",
                Integer.class
        );

        assertEquals(1, tableCount);
        assertEquals(1, indexCount);
    }
}
