package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.JobStatus;
import net.jrodolfo.jobportal.constant.ResumeParseStatus;
import net.jrodolfo.jobportal.exception.ResourceException;
import net.jrodolfo.jobportal.exception.ResumeMatchUnavailableException;
import net.jrodolfo.jobportal.model.Job;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.repository.JobRepository;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResumeJobMatchServiceTest {

    @Mock
    private ResumeRepository resumeRepository;
    @Mock
    private JobRepository jobRepository;

    private ResumeJobMatchService service;

    @BeforeEach
    void setUp() {
        service = new ResumeJobMatchService(resumeRepository, jobRepository, new TechnicalSkillMatcher());
    }

    @Test
    void calculatesScoresAndUsesStableBusinessOrdering() {
        Resume resume = parsedResume("Java Spring Boot Docker");
        LocalDateTime tiedCreatedAt = LocalDateTime.of(2026, 9, 15, 12, 0);
        Job partial = job(4L, "Java backend", "Spring Boot and Kubernetes", tiedCreatedAt.plusHours(1));
        Job perfectLowerId = job(8L, "Docker platform", "Build containers", tiedCreatedAt);
        Job perfectHigherId = job(9L, "Docker engineer", "Container delivery", tiedCreatedAt);
        Job notComparable = job(20L, "Product manager", "Roadmaps and communication", tiedCreatedAt.plusDays(1));
        when(resumeRepository.findByIdAndUser_EmailIgnoreCase(7L, "applicant@example.com"))
                .thenReturn(Optional.of(resume));
        when(jobRepository.findTop100ByStatusOrderByCreatedAtDescIdDesc(JobStatus.OPEN))
                .thenReturn(List.of(notComparable, partial, perfectLowerId, perfectHigherId));

        var response = service.matchOwnResume(7L, "applicant@example.com");

        assertEquals(ResumeJobMatchService.ALGORITHM_VERSION, response.algorithmVersion());
        assertEquals(List.of("Java", "Spring Boot", "Docker"), response.resumeSkills());
        assertEquals(List.of(9L, 8L, 4L, 20L), response.jobs().stream().map(match -> match.id()).toList());
        assertEquals(67, response.jobs().get(2).score());
        assertEquals(List.of("Java", "Spring Boot"), response.jobs().get(2).matchedSkills());
        assertEquals(List.of("Kubernetes"), response.jobs().get(2).missingSkills());
        assertTrue(response.jobs().get(2).explanation().contains("2/3"));
        assertFalse(response.jobs().get(3).comparable());
        assertNull(response.jobs().get(3).score());
        assertTrue(response.jobs().get(3).explanation().contains("无法比较"));
        verify(jobRepository).findTop100ByStatusOrderByCreatedAtDescIdDesc(JobStatus.OPEN);
    }

    @Test
    void emptyResumeSkillSetProducesZeroForComparableJobsAndNullForUnskilledJobs() {
        Resume resume = parsedResume("Product discovery and stakeholder communication");
        when(resumeRepository.findByIdAndUser_EmailIgnoreCase(7L, "applicant@example.com"))
                .thenReturn(Optional.of(resume));
        when(jobRepository.findTop100ByStatusOrderByCreatedAtDescIdDesc(JobStatus.OPEN))
                .thenReturn(List.of(
                        job(1L, "Java engineer", "Build REST APIs", LocalDateTime.now()),
                        job(2L, "Product manager", "Build roadmaps", LocalDateTime.now().minusDays(1))
                ));

        var response = service.matchOwnResume(7L, "applicant@example.com");

        assertEquals(List.of(), response.resumeSkills());
        assertTrue(response.jobs().get(0).comparable());
        assertEquals(0, response.jobs().get(0).score());
        assertEquals(List.of(), response.jobs().get(0).matchedSkills());
        assertEquals(List.of("Java", "REST API"), response.jobs().get(0).missingSkills());
        assertFalse(response.jobs().get(1).comparable());
        assertNull(response.jobs().get(1).score());
    }

    @Test
    void hidesMissingOrNonOwnedResumeBeforeLoadingJobs() {
        when(resumeRepository.findByIdAndUser_EmailIgnoreCase(7L, "applicant@example.com"))
                .thenReturn(Optional.empty());

        assertThrows(ResourceException.class,
                () -> service.matchOwnResume(7L, "applicant@example.com"));

        verifyNoInteractions(jobRepository);
    }

    @Test
    void rejectsNonSuccessfulOrBlankParsedResumeBeforeLoadingJobs() {
        Resume queued = parsedResume("Java");
        queued.setParseStatus(ResumeParseStatus.QUEUED);
        when(resumeRepository.findByIdAndUser_EmailIgnoreCase(7L, "applicant@example.com"))
                .thenReturn(Optional.of(queued));

        assertThrows(ResumeMatchUnavailableException.class,
                () -> service.matchOwnResume(7L, "applicant@example.com"));

        Resume blank = parsedResume(" ");
        when(resumeRepository.findByIdAndUser_EmailIgnoreCase(8L, "applicant@example.com"))
                .thenReturn(Optional.of(blank));
        assertThrows(ResumeMatchUnavailableException.class,
                () -> service.matchOwnResume(8L, "applicant@example.com"));
        verifyNoInteractions(jobRepository);
    }

    private Resume parsedResume(String text) {
        Resume resume = new Resume();
        resume.setId(7L);
        resume.setParseStatus(ResumeParseStatus.SUCCEEDED);
        resume.setExtractedText(text);
        return resume;
    }

    private Job job(Long id, String title, String description, LocalDateTime createdAt) {
        Job job = new Job(title, description, "Example Co");
        job.setId(id);
        job.setCreatedAt(createdAt);
        return job;
    }
}
