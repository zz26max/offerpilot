package net.jrodolfo.jobportal.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import net.jrodolfo.jobportal.constant.OutboxStatus;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "resume_outbox",
        uniqueConstraints = @UniqueConstraint(name = "uk_resume_outbox_event_id", columnNames = "event_id")
)
@Getter
@Setter
@NoArgsConstructor
public class ResumeOutboxEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", nullable = false, length = 36, unique = true)
    private String eventId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "resume_id", nullable = false)
    private Resume resume;

    @Column(name = "event_type", nullable = false, length = 64)
    private String eventType;

    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private OutboxStatus status = OutboxStatus.PENDING;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "available_at", nullable = false)
    private LocalDateTime availableAt;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "locked_by", length = 64)
    private String lockedBy;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "last_error", length = 255)
    private String lastError;

    public ResumeOutboxEvent(String eventId, Resume resume, String eventType, int schemaVersion) {
        this.eventId = eventId;
        this.resume = resume;
        this.eventType = eventType;
        this.schemaVersion = schemaVersion;
        this.status = OutboxStatus.PENDING;
    }

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (availableAt == null) {
            availableAt = now;
        }
        if (createdAt == null) {
            createdAt = now;
        }
    }
}
