package net.jrodolfo.jobportal.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import net.jrodolfo.jobportal.dto.ResumeDownload;
import net.jrodolfo.jobportal.dto.ResumeDetailResponse;
import net.jrodolfo.jobportal.dto.ResumeResponse;
import net.jrodolfo.jobportal.dto.ResumeJobMatchesResponse;
import net.jrodolfo.jobportal.exception.ErrorResponse;
import net.jrodolfo.jobportal.service.ResumeService;
import net.jrodolfo.jobportal.service.ResumeJobMatchService;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/resumes")
@Tag(name = "Resumes", description = "Applicant resume upload and retrieval")
@SecurityRequirement(name = "basicAuth")
public class ResumeController {

    private final ResumeService resumeService;
    private final ResumeJobMatchService resumeJobMatchService;

    public ResumeController(ResumeService resumeService, ResumeJobMatchService resumeJobMatchService) {
        this.resumeService = resumeService;
        this.resumeJobMatchService = resumeJobMatchService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload a PDF or DOCX resume")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Resume uploaded"),
            @ApiResponse(responseCode = "400", description = "Invalid resume", content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "413", description = "Resume is too large", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    public ResponseEntity<ResumeResponse> upload(Authentication authentication,
                                                 @RequestPart("file") MultipartFile file) {
        ResumeResponse response = resumeService.upload(authentication.getName(), file);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    @Operation(summary = "List the current applicant's resume metadata")
    public List<ResumeResponse> list(Authentication authentication) {
        return resumeService.listOwn(authentication.getName());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get owner-visible resume details and extracted text")
    @ApiResponse(responseCode = "404", description = "Resume not found", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public ResumeDetailResponse get(@PathVariable Long id, Authentication authentication) {
        return resumeService.getOwn(id, authentication.getName());
    }

    @GetMapping("/{id}/matches")
    @Operation(
            summary = "Match one successfully parsed resume against open jobs",
            description = "Calculates versioned technical-skill coverage using a finite rule dictionary. This is not an AI assessment."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Rule-based matches calculated"),
            @ApiResponse(responseCode = "404", description = "Resume not found", content = @Content(schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "409", description = "Resume text is not ready for matching", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    })
    public ResumeJobMatchesResponse matches(@PathVariable Long id, Authentication authentication) {
        return resumeJobMatchService.matchOwnResume(id, authentication.getName());
    }

    @GetMapping("/{id}/content")
    @Operation(summary = "Download one of the current applicant's resumes")
    @ApiResponse(responseCode = "404", description = "Resume not found", content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    public ResponseEntity<Resource> download(@PathVariable Long id, Authentication authentication) {
        ResumeDownload download = resumeService.downloadOwn(id, authentication.getName());
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(download.originalFilename(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(download.contentType()))
                .contentLength(download.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(download.resource());
    }
}
