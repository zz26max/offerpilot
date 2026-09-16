package net.jrodolfo.jobportal.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Versioned, rule-based technical skill coverage for open jobs. This is not an AI assessment.")
public record ResumeJobMatchesResponse(
        @Schema(example = "technical-skills-v1")
        String algorithmVersion,
        Long resumeId,
        List<String> resumeSkills,
        List<JobMatchResponse> jobs
) {
}
