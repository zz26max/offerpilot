package net.jrodolfo.jobportal.repository;

import net.jrodolfo.jobportal.model.Resume;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.List;
import java.util.Optional;

public interface ResumeRepository extends JpaRepository<Resume, Long> {

    List<Resume> findByUser_EmailIgnoreCaseOrderByCreatedAtDescIdDesc(String email);

    Optional<Resume> findByIdAndUser_EmailIgnoreCase(Long id, String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select resume from Resume resume where resume.id = :id")
    Optional<Resume> findByIdForUpdate(@Param("id") Long id);
}
