import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import axios from "axios";
import {useSessionTimeout} from "../auth/session";
import {BACKEND_API_URL} from "../config/backend";
import {formatStatus, localizeApiMessage} from "../i18n/messages";
import {
    ACTIVE_PARSE_STATUSES,
    formatBytes,
    formatContentType,
    formatTimestamp,
    getStatusClassName,
    getStatusDescription,
    safeDownloadName,
    validateSelectedFiles
} from "./resumePanelUtils";

const ResumePanel = () => {
    const handleSessionTimeout = useSessionTimeout();
    const fileInputRef = useRef(null);
    const mountedRef = useRef(false);
    const listRequestInFlightRef = useRef(false);
    const uploadInFlightRef = useRef(false);
    const detailRequestsInFlightRef = useRef(new Set());
    const downloadsInFlightRef = useRef(new Set());

    const [resumes, setResumes] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState("");
    const [uploadError, setUploadError] = useState("");
    const [listError, setListError] = useState("");
    const [pollingPaused, setPollingPaused] = useState(false);
    const [expandedRecords, setExpandedRecords] = useState({});
    const [expandedDetails, setExpandedDetails] = useState({});
    const [detailLoading, setDetailLoading] = useState({});
    const [detailErrors, setDetailErrors] = useState({});
    const [downloading, setDownloading] = useState({});

    const authConfig = useCallback((extra = {}) => ({
        ...extra,
        headers: {
            ...extra.headers,
            Authorization: `Bearer ${localStorage.getItem("token")}`
        }
    }), []);

    const loadResumes = useCallback(async ({silent = false} = {}) => {
        if (listRequestInFlightRef.current) {
            return;
        }

        listRequestInFlightRef.current = true;
        if (!silent && mountedRef.current) {
            setListError("");
        }
        try {
            const response = await axios.get(`${BACKEND_API_URL}/api/resumes`, authConfig());
            if (!mountedRef.current) {
                return;
            }
            setResumes(Array.isArray(response.data) ? response.data : []);
            setListError("");
            setPollingPaused(false);
        } catch (error) {
            if (!mountedRef.current || handleSessionTimeout(error)) {
                return;
            }
            if (silent) {
                setPollingPaused(true);
                setListError("自动刷新暂时中断。你可以手动刷新状态后继续。");
            } else {
                setListError("暂时无法加载简历记录，请稍后重试。");
            }
        } finally {
            listRequestInFlightRef.current = false;
            if (!silent && mountedRef.current) {
                setIsInitialLoading(false);
            }
        }
    }, [authConfig, handleSessionTimeout]);

    useEffect(() => {
        mountedRef.current = true;
        void loadResumes();
        return () => {
            mountedRef.current = false;
        };
    }, [loadResumes]);

    const hasActiveParsing = useMemo(
        () => resumes.some((resume) => ACTIVE_PARSE_STATUSES.has(resume.parseStatus)),
        [resumes]
    );

    useEffect(() => {
        if (!hasActiveParsing || pollingPaused) {
            return undefined;
        }

        const timeoutId = window.setTimeout(() => {
            void loadResumes({silent: true});
        }, 2000);
        return () => window.clearTimeout(timeoutId);
    }, [hasActiveParsing, loadResumes, pollingPaused, resumes]);

    const handleFileChange = (event) => {
        setUploadMessage("");
        const validationMessage = validateSelectedFiles(event.target.files);
        if (validationMessage) {
            setSelectedFile(null);
            setUploadError(validationMessage);
            event.target.value = "";
            return;
        }
        setUploadError("");
        setSelectedFile(event.target.files[0]);
    };

    const uploadResume = async (event) => {
        event.preventDefault();
        if (uploadInFlightRef.current) {
            return;
        }

        const validationMessage = validateSelectedFiles(selectedFile ? [selectedFile] : []);
        if (validationMessage) {
            setUploadError(validationMessage);
            return;
        }

        uploadInFlightRef.current = true;
        setIsUploading(true);
        setUploadError("");
        setUploadMessage("");
        const formData = new FormData();
        formData.append("file", selectedFile);
        try {
            const response = await axios.post(
                `${BACKEND_API_URL}/api/resumes`,
                formData,
                authConfig()
            );
            if (!mountedRef.current) {
                return;
            }
            setResumes((current) => [
                response.data,
                ...current.filter((resume) => resume.id !== response.data.id)
            ]);
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            setUploadMessage("简历上传成功，系统正在准备解析。");
        } catch (error) {
            if (!mountedRef.current || handleSessionTimeout(error)) {
                return;
            }
            setUploadError(localizeApiMessage(
                error?.response?.data?.message,
                "简历上传失败，请检查文件后重试。"
            ));
        } finally {
            uploadInFlightRef.current = false;
            if (mountedRef.current) {
                setIsUploading(false);
            }
        }
    };

    const loadDetails = async (resume) => {
        if (detailRequestsInFlightRef.current.has(resume.id)) {
            return;
        }

        detailRequestsInFlightRef.current.add(resume.id);
        setDetailLoading((current) => ({...current, [resume.id]: true}));
        setDetailErrors((current) => ({...current, [resume.id]: ""}));
        try {
            const response = await axios.get(
                `${BACKEND_API_URL}/api/resumes/${resume.id}`,
                authConfig()
            );
            if (mountedRef.current) {
                setExpandedDetails((current) => ({...current, [resume.id]: response.data}));
            }
        } catch (error) {
            if (!mountedRef.current || handleSessionTimeout(error)) {
                return;
            }
            setDetailErrors((current) => ({
                ...current,
                [resume.id]: "暂时无法加载解析文本，请重试。"
            }));
        } finally {
            detailRequestsInFlightRef.current.delete(resume.id);
            if (mountedRef.current) {
                setDetailLoading((current) => ({...current, [resume.id]: false}));
            }
        }
    };

    const toggleDetails = (resume) => {
        if (expandedRecords[resume.id]) {
            setExpandedRecords((current) => ({...current, [resume.id]: false}));
            return;
        }

        setExpandedRecords((current) => ({...current, [resume.id]: true}));
        if (expandedDetails[resume.id]?.extractedText == null) {
            void loadDetails(resume);
        }
    };

    const downloadResume = async (resume) => {
        if (downloadsInFlightRef.current.has(resume.id)) {
            return;
        }
        downloadsInFlightRef.current.add(resume.id);
        setDownloading((current) => ({...current, [resume.id]: true}));
        try {
            const response = await axios.get(
                `${BACKEND_API_URL}/api/resumes/${resume.id}/content`,
                authConfig({responseType: "blob"})
            );
            if (!mountedRef.current) {
                return;
            }
            const objectUrl = URL.createObjectURL(response.data);
            try {
                const anchor = document.createElement("a");
                anchor.href = objectUrl;
                anchor.download = safeDownloadName(resume.originalFilename);
                document.body.appendChild(anchor);
                try {
                    anchor.click();
                } finally {
                    anchor.remove();
                }
            } finally {
                URL.revokeObjectURL(objectUrl);
            }
        } catch (error) {
            if (!mountedRef.current || handleSessionTimeout(error)) {
                return;
            }
            setListError("暂时无法下载该简历，请稍后重试。");
        } finally {
            downloadsInFlightRef.current.delete(resume.id);
            if (mountedRef.current) {
                setDownloading((current) => ({...current, [resume.id]: false}));
            }
        }
    };

    const retryList = () => {
        setPollingPaused(false);
        void loadResumes();
    };

    return (
        <section className="resume-workbench" aria-labelledby="resume-panel-title">
            <div className="resume-panel-heading">
                <div>
                    <h2 className="resume-panel-title" id="resume-panel-title">我的简历</h2>
                    <p className="body-text muted-meta mb-0">上传并查看解析状态，解析完成后可按需核对文本。</p>
                </div>
                {hasActiveParsing && !pollingPaused ? (
                    <span className="resume-sync-indicator" role="status">每 2 秒自动更新状态</span>
                ) : null}
            </div>

            <form className="resume-upload-bar" onSubmit={uploadResume} noValidate>
                <div className="resume-file-field">
                    <label className="form-label metadata-label" htmlFor="resume-file">选择简历文件</label>
                    <input
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="form-control"
                        disabled={isUploading}
                        id="resume-file"
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        type="file"
                    />
                    <span className="resume-file-help">支持 PDF、DOCX，单个文件不超过 5 MiB。</span>
                </div>
                <button className="btn btn-accent-primary resume-upload-button" disabled={isUploading} type="submit">
                    {isUploading ? "正在上传…" : "上传简历"}
                </button>
            </form>
            <div className="resume-feedback" aria-live="polite">
                {uploadMessage ? <p className="text-success mb-0" role="status">{uploadMessage}</p> : null}
                {uploadError ? <p className="text-danger mb-0" role="alert">{uploadError}</p> : null}
            </div>

            <div className="resume-records-heading">
                <h3>上传记录</h3>
                {!isInitialLoading ? (
                    <button className="btn btn-sm btn-outline-secondary" onClick={retryList} type="button">
                        刷新状态
                    </button>
                ) : null}
            </div>

            {listError ? (
                <div className="resume-inline-error" role="alert">
                    <span>{listError}</span>
                    <button className="btn btn-sm btn-outline-secondary" onClick={retryList} type="button">重试</button>
                </div>
            ) : null}

            {isInitialLoading ? (
                <p className="resume-empty-state" role="status">正在加载简历记录…</p>
            ) : resumes.length === 0 ? (
                !listError ? (
                    <div className="resume-empty-state">
                        <p className="mb-1">还没有上传过简历。</p>
                        <p className="muted-meta mb-0">选择上方的 PDF 或 DOCX 文件开始建立记录。</p>
                    </div>
                ) : null
            ) : (
                <div className="resume-record-list">
                    {resumes.map((resume) => {
                        const detail = expandedDetails[resume.id];
                        const isExpanded = Boolean(expandedRecords[resume.id]);
                        const detailsId = `resume-details-${resume.id}`;
                        return (
                            <article className="resume-record" key={resume.id}>
                                <div className="resume-record-main">
                                    <div className="resume-record-title-row">
                                        <h4 title={resume.originalFilename}>{resume.originalFilename}</h4>
                                        <span className={`resume-status ${getStatusClassName(resume.parseStatus)}`}>
                                            {formatStatus(resume.parseStatus)}
                                        </span>
                                    </div>
                                    <p className="resume-status-description">{getStatusDescription(resume.parseStatus)}</p>
                                    <dl className="resume-metadata">
                                        <div>
                                            <dt>文件类型</dt>
                                            <dd title={resume.contentType || undefined}>{formatContentType(resume.contentType)}</dd>
                                        </div>
                                        <div><dt>文件大小</dt><dd>{formatBytes(resume.sizeBytes)}</dd></div>
                                        <div><dt>上传时间</dt><dd>{formatTimestamp(resume.createdAt)}</dd></div>
                                        <div><dt>失败次数</dt><dd>{Number.isFinite(resume.attempts) ? resume.attempts : "—"}</dd></div>
                                        <div><dt>错误代码</dt><dd>{resume.errorCode || "—"}</dd></div>
                                    </dl>
                                </div>
                                <div className="resume-record-actions">
                                    {resume.parseStatus === "SUCCEEDED" ? (
                                        <button
                                            aria-controls={detailsId}
                                            aria-expanded={isExpanded}
                                            className="btn btn-sm btn-outline-secondary"
                                            disabled={Boolean(detailLoading[resume.id])}
                                            onClick={() => toggleDetails(resume)}
                                            type="button"
                                        >
                                            {detailLoading[resume.id] ? "正在加载…" : isExpanded ? "收起解析文本" : "查看解析文本"}
                                        </button>
                                    ) : null}
                                    <button
                                        className="btn btn-sm btn-accent-secondary"
                                        disabled={Boolean(downloading[resume.id])}
                                        onClick={() => downloadResume(resume)}
                                        type="button"
                                    >
                                        {downloading[resume.id] ? "正在下载…" : "下载原文件"}
                                    </button>
                                </div>
                                {isExpanded ? (
                                    <div className="resume-detail" id={detailsId}>
                                        {detailLoading[resume.id] ? <p role="status">正在加载解析文本…</p> : null}
                                        {detailErrors[resume.id] ? (
                                            <div className="resume-detail-error" role="alert">
                                                <span>{detailErrors[resume.id]}</span>
                                                <button
                                                    className="btn btn-sm btn-outline-secondary"
                                                    onClick={() => loadDetails(resume)}
                                                    type="button"
                                                >
                                                    重试加载
                                                </button>
                                            </div>
                                        ) : null}
                                        {!detailLoading[resume.id] && !detailErrors[resume.id] && detail?.extractedText != null ? (
                                            <pre>{detail.extractedText}</pre>
                                        ) : null}
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default ResumePanel;
