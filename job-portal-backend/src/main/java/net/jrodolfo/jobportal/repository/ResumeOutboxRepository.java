package net.jrodolfo.jobportal.repository;

import jakarta.persistence.LockModeType;
import net.jrodolfo.jobportal.constant.OutboxStatus;
import net.jrodolfo.jobportal.model.ResumeOutboxEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ResumeOutboxRepository extends JpaRepository<ResumeOutboxEvent, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select event from ResumeOutboxEvent event
            where (event.status = :pending and event.availableAt <= :now)
               or (event.status = :inProgress and event.lockedUntil <= :now)
            order by event.id
            """)
    List<ResumeOutboxEvent> findClaimable(@Param("pending") OutboxStatus pending,
                                           @Param("inProgress") OutboxStatus inProgress,
                                           @Param("now") LocalDateTime now,
                                           Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ResumeOutboxEvent> findByEventIdAndLockedBy(String eventId, String lockedBy);

    Optional<ResumeOutboxEvent> findByResume_Id(Long resumeId);
}
