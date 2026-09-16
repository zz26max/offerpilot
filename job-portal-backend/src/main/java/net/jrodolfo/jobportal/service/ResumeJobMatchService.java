package net.jrodolfo.jobportal.service;

import net.jrodolfo.jobportal.constant.JobStatus;
import net.jrodolfo.jobportal.constant.ResumeParseStatus;
import net.jrodolfo.jobportal.dto.JobMatchResponse;
import net.jrodolfo.jobportal.dto.ResumeJobMatchesResponse;
import net.jrodolfo.jobportal.exception.ResourceException;
import net.jrodolfo.jobportal.exception.ResumeMatchUnavailableException;
import net.jrodolfo.jobportal.model.Job;
import net.jrodolfo.jobportal.model.Resume;
import net.jrodolfo.jobportal.repository.JobRepository;
import net.jrodolfo.jobportal.repository.ResumeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class ResumeJobMatchService {

    public static final String ALGORITHM_VERSION = "technical-skills-v1";

    private static final Comparator<MatchCandidate> MATCH_ORDER = Comparator
            .<MatchCandidate, Boolean>comparing(candidate -> candidate.response().comparable(), Comparator.reverseOrder())
            .thenComparing(candidate -> candidate.response().score(), Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(MatchCandidate::createdAt, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(MatchCandidate::jobId, Comparator.nullsLast(Comparator.reverseOrder()));

    private final ResumeRepository resumeRepository;
    private final JobRepository jobRepository;
    private final TechnicalSkillMatcher skillMatcher;

    public ResumeJobMatchService(ResumeRepository resumeRepository,
                                 JobRepository jobRepository,
                                 TechnicalSkillMatcher skillMatcher) {
        this.resumeRepository = resumeRepository;
        this.jobRepository = jobRepository;
        this.skillMatcher = skillMatcher;
    }

    @Transactional(readOnly = true)
    public ResumeJobMatchesResponse matchOwnResume(Long resumeId, String email) {
        Resume resume = resumeRepository.findByIdAndUser_EmailIgnoreCase(resumeId, email)
                .orElseThrow(() -> new ResourceException("Resume with id " + resumeId + " was not found"));
        if (resume.getParseStatus() != ResumeParseStatus.SUCCEEDED
                || resume.getExtractedText() == null
                || resume.getExtractedText().isBlank()) {
            throw new ResumeMatchUnavailableException();
        }

        List<String> resumeSkills = skillMatcher.findSkills(resume.getExtractedText());
        Set<String> resumeSkillSet = new HashSet<>(resumeSkills);
        List<JobMatchResponse> matches = jobRepository
                .findTop100ByStatusOrderByCreatedAtDescIdDesc(JobStatus.OPEN)
                .stream()
                .map(job -> match(job, resumeSkillSet))
                .sorted(MATCH_ORDER)
                .map(MatchCandidate::response)
                .toList();

        return new ResumeJobMatchesResponse(ALGORITHM_VERSION, resume.getId(), resumeSkills, matches);
    }

    private MatchCandidate match(Job job, Set<String> resumeSkills) {
        List<String> requiredSkills = skillMatcher.findSkills(job.getTitle() + "\n" + job.getDescription());
        List<String> matchedSkills = requiredSkills.stream().filter(resumeSkills::contains).toList();
        List<String> missingSkills = requiredSkills.stream().filter(skill -> !resumeSkills.contains(skill)).toList();

        JobMatchResponse response;
        if (requiredSkills.isEmpty()) {
            response = new JobMatchResponse(
                    job.getId(),
                    job.getTitle(),
                    job.getCompany(),
                    null,
                    false,
                    List.of(),
                    List.of(),
                    "岗位信息中未识别到规则词典内的技术技能，暂时无法比较。"
            );
        } else {
            int score = (int) Math.round(matchedSkills.size() * 100.0 / requiredSkills.size());
            response = new JobMatchResponse(
                    job.getId(),
                    job.getTitle(),
                    job.getCompany(),
                    score,
                    true,
                    matchedSkills,
                    missingSkills,
                    "简历覆盖 " + matchedSkills.size() + "/" + requiredSkills.size()
                            + " 项已识别岗位技能，规则匹配度为 " + score + "%。"
            );
        }
        return new MatchCandidate(job.getCreatedAt(), job.getId(), response);
    }

    private record MatchCandidate(LocalDateTime createdAt, Long jobId, JobMatchResponse response) {
    }
}
