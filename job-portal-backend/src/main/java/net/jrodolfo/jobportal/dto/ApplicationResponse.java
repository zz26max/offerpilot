package net.jrodolfo.jobportal.dto;

import net.jrodolfo.jobportal.constant.ApplicationStatus;
import net.jrodolfo.jobportal.constant.JobStatus;
import net.jrodolfo.jobportal.model.Application;
import net.jrodolfo.jobportal.model.Job;
import net.jrodolfo.jobportal.model.User;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * API-safe representation of an application. Persistence entities are not
 * serialized so credentials and future internal user fields cannot leak.
 */
public record ApplicationResponse(
        Long id,
        ApplicantSummary user,
        JobSummary job,
        ApplicationStatus status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static ApplicationResponse from(Application application) {
        return new ApplicationResponse(
                application.getId(),
                ApplicantSummary.from(application.getUser()),
                JobSummary.from(application.getJob()),
                application.getStatus(),
                application.getCreatedAt(),
                application.getUpdatedAt()
        );
    }

    public record ApplicantSummary(Long id, String name, String email) {
        private static ApplicantSummary from(User user) {
            return user == null ? null : new ApplicantSummary(user.getId(), user.getName(), user.getEmail());
        }
    }

    public record JobSummary(
            Long id,
            String title,
            String description,
            String company,
            LocalDate postedDate,
            JobStatus status,
            LocalDateTime createdAt,
            LocalDateTime updatedAt
    ) {
        private static JobSummary from(Job job) {
            return job == null ? null : new JobSummary(
                    job.getId(),
                    job.getTitle(),
                    job.getDescription(),
                    job.getCompany(),
                    job.getPostedDate(),
                    job.getStatus(),
                    job.getCreatedAt(),
                    job.getUpdatedAt()
            );
        }
    }
}
