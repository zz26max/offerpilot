package net.jrodolfo.jobportal.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "One open job's rule-based technical skill coverage result.")
public record JobMatchResponse(
        Long id,
        String title,
        String company,
        @Schema(description = "Rounded matched/required percentage, or null when no dictionary skill is required.", nullable = true)
        Integer score,
        boolean comparable,
        List<String> matchedSkills,
        List<String> missingSkills,
        String explanation
) {
}
