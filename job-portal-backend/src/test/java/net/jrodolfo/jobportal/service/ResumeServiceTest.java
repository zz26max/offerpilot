package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.AuthProvider;
import net.jrodolfo.jobportal.constant.Role;
import net.jrodolfo.jobportal.exception.ResourceException;
import net.jrodolfo.jobportal.exception.ResumeTooLargeException;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.model.User;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import net.jrodolfo.jobportal.repository.UserRepository;
import net.jrodolfo.jobportal.storage.ResumeStorage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResumeServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private ResumeRepository resumeRepository;
    @Mock
    private ResumeStorage resumeStorage;

    private ResumeService service;
    private User owner;

    @BeforeEach
    void setUp() {
        service = new ResumeService(userRepository, resumeRepository, resumeStorage, new ResumeFileValidator());
        owner = new User("Applicant", "applicant@example.com", "password", AuthProvider.LOCAL, Role.APPLICANT);
        owner.setId(10L);
    }

    @Test
    void uploadPersistsCanonicalMetadataAndSha256() {
        byte[] content = "%PDF-1.7\nresume".getBytes();
        MockMultipartFile file = new MockMultipartFile("file", "C:\\fakepath\\cv.pdf", "text/plain", content);
        when(userRepository.findByEmailIgnoreCase("applicant@example.com")).thenReturn(Optional.of(owner));
        when(resumeStorage.store(content, "pdf")).thenReturn("11111111-1111-1111-1111-111111111111.pdf");
        when(resumeRepository.saveAndFlush(any(Resume.class))).thenAnswer(invocation -> {
            Resume resume = invocation.getArgument(0);
            resume.setId(7L);
            resume.setCreatedAt(LocalDateTime.of(2026, 9, 14, 10, 0));
            resume.setUpdatedAt(resume.getCreatedAt());
            return resume;
        });

        var response = service.upload("applicant@example.com", file);

        ArgumentCaptor<Resume> captor = ArgumentCaptor.forClass(Resume.class);
        verify(resumeRepository).saveAndFlush(captor.capture());
        Resume saved = captor.getValue();
        assertEquals("cv.pdf", saved.getOriginalFilename());
        assertEquals(ResumeFileValidator.PDF_CONTENT_TYPE, saved.getContentType());
        assertEquals(content.length, saved.getSizeBytes());
        assertEquals("f01894932c42e83c20cd9d9ab89ff77797e84e264133e6984ab9df2d71e7d821", saved.getSha256());
        assertEquals(7L, response.id());
    }

    @Test
    void removesStoredFileWhenDatabaseWriteFails() {
        byte[] content = "%PDF-1.7\nresume".getBytes();
        MockMultipartFile file = new MockMultipartFile("file", "resume.pdf", "application/pdf", content);
        String storageKey = "11111111-1111-1111-1111-111111111111.pdf";
        when(userRepository.findByEmailIgnoreCase("applicant@example.com")).thenReturn(Optional.of(owner));
        when(resumeStorage.store(content, "pdf")).thenReturn(storageKey);
        when(resumeRepository.saveAndFlush(any(Resume.class)))
                .thenThrow(new DataIntegrityViolationException("database unavailable"));

        assertThrows(DataIntegrityViolationException.class,
                () -> service.upload("applicant@example.com", file));

        verify(resumeStorage).delete(storageKey);
    }

    @Test
    void rejectsOversizedFileBeforeStorage() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "resume.pdf", "application/pdf", new byte[(5 * 1024 * 1024) + 1]
        );

        assertThrows(ResumeTooLargeException.class, () -> service.upload("applicant@example.com", file));
        verifyNoInteractions(userRepository, resumeRepository, resumeStorage);
    }

    @Test
    void listUsesStableOwnerScopedRepositoryOrder() {
        when(resumeRepository.findByUser_EmailIgnoreCaseOrderByCreatedAtDescIdDesc("applicant@example.com"))
                .thenReturn(List.of(resume(2L), resume(1L)));

        var responses = service.listOwn("applicant@example.com");

        assertEquals(List.of(2L, 1L), responses.stream().map(response -> response.id()).toList());
    }

    @Test
    void downloadUsesCombinedIdAndOwnerLookupAndHidesNonOwnedRows() {
        when(resumeRepository.findByIdAndUser_EmailIgnoreCase(42L, "applicant@example.com"))
                .thenReturn(Optional.empty());

        assertThrows(ResourceException.class,
                () -> service.downloadOwn(42L, "applicant@example.com"));
        verifyNoInteractions(resumeStorage);
    }

    @Test
    void downloadLoadsStoredContentAfterOwnershipCheck() {
        Resume resume = resume(42L);
        when(resumeRepository.findByIdAndUser_EmailIgnoreCase(42L, "applicant@example.com"))
                .thenReturn(Optional.of(resume));
        when(resumeStorage.load(resume.getStorageKey())).thenReturn(new ByteArrayResource("content".getBytes()));

        var download = service.downloadOwn(42L, "applicant@example.com");

        assertEquals("resume.pdf", download.originalFilename());
        verify(resumeStorage).load(resume.getStorageKey());
    }

    private Resume resume(Long id) {
        Resume resume = new Resume(
                owner,
                "resume.pdf",
                "11111111-1111-1111-1111-11111111111" + id + ".pdf",
                ResumeFileValidator.PDF_CONTENT_TYPE,
                12,
                "a".repeat(64)
        );
        resume.setId(id);
        resume.setCreatedAt(LocalDateTime.now());
        resume.setUpdatedAt(LocalDateTime.now());
        return resume;
    }
}
