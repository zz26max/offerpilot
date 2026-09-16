const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;
const ACTIVE_PARSE_STATUSES = new Set(["QUEUED", "PROCESSING"]);
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
const PDF_CONTENT_TYPE = "application/pdf";
const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const resumeDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
});

const formatBytes = (sizeBytes) => {
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
        return "—";
    }
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }
    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KiB`;
    }
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MiB`;
};

const formatTimestamp = (timestamp) => {
    if (!timestamp) {
        return "—";
    }
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? timestamp : resumeDateTimeFormatter.format(parsed);
};

const formatContentType = (contentType) => {
    if (!contentType) {
        return "—";
    }
    if (contentType === PDF_CONTENT_TYPE) {
        return "PDF";
    }
    if (contentType === DOCX_CONTENT_TYPE) {
        return "DOCX";
    }
    return "其他格式";
};

const formatMatchScore = (match) => (
    match?.comparable && Number.isFinite(match.score) ? `${match.score}%` : "不可比较"
);

const validateSelectedFiles = (files) => {
    if (!files || files.length === 0) {
        return "请选择一份简历文件。";
    }
    if (files.length !== 1) {
        return "每次只能上传一份简历。";
    }

    const [file] = files;
    const lowerName = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
        return "仅支持 PDF 或 DOCX 格式的简历。";
    }
    if (file.size === 0) {
        return "简历文件不能为空。";
    }
    if (file.size > MAX_RESUME_SIZE_BYTES) {
        return "简历文件不能超过 5 MiB。";
    }
    return "";
};

const getStatusDescription = (status) => {
    switch (status) {
        case "UPLOADED":
            return "历史上传记录尚未进入解析流程，如需解析请重新上传。";
        case "QUEUED":
            return "已进入解析队列，状态会自动刷新。";
        case "PROCESSING":
            return "正在提取简历文本，状态会自动刷新。";
        case "SUCCEEDED":
            return "文本解析完成，可按需查看解析内容。";
        case "FAILED":
            return "本次解析未完成，可根据错误代码排查后重新上传。";
        default:
            return "解析状态暂不可用。";
    }
};

const getStatusClassName = (status) => {
    switch (status) {
        case "QUEUED":
        case "PROCESSING":
            return "resume-status-active";
        case "SUCCEEDED":
            return "resume-status-succeeded";
        case "FAILED":
            return "resume-status-failed";
        case "UPLOADED":
            return "resume-status-history";
        default:
            return "resume-status-unknown";
    }
};

const safeDownloadName = (filename) => {
    const sanitized = Array.from(String(filename || "resume"), (character) => {
        const code = character.codePointAt(0);
        return character === "/" || character === "\\" || code < 32 || code === 127 ? "_" : character;
    }).join("").trim();
    return sanitized || "resume";
};

export {
    ACTIVE_PARSE_STATUSES,
    MAX_RESUME_SIZE_BYTES,
    formatBytes,
    formatContentType,
    formatMatchScore,
    formatTimestamp,
    getStatusClassName,
    getStatusDescription,
    safeDownloadName,
    validateSelectedFiles
};
