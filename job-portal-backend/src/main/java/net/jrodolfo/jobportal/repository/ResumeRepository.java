package net.jrodolfo.jobportal.repository;

import net.jrodolfo.jobportal.model.Resume;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ResumeRepository extends JpaRepository<Resume, Long> {

    List<Resume> findByUser_EmailIgnoreCaseOrderByCreatedAtDescIdDesc(String email);

    Optional<Resume> findByIdAndUser_EmailIgnoreCase(Long id, String email);
}
