const statusLabels = {
    OPEN: "招聘中",
    CLOSED: "已关闭",
    APPLIED: "已投递",
    REVIEWING: "筛选中",
    ACCEPTED: "已录用",
    REJECTED: "未通过",
    WITHDRAWN: "已撤回",
    UPLOADED: "历史记录",
    QUEUED: "等待解析",
    PROCESSING: "解析中",
    SUCCEEDED: "解析完成",
    FAILED: "解析失败",
    ADMIN: "管理员",
    APPLICANT: "求职者",
    ROLE_ADMIN: "管理员",
    ROLE_APPLICANT: "求职者",
    ENABLED: "已启用",
    DISABLED: "已停用"
};

const apiMessageTranslations = {
    "Invalid email or password.": "邮箱或密码错误。",
    "Your account is disabled. Please contact an administrator.": "账号已停用，请联系管理员。",
    "You do not have permission to access this API resource.": "你没有权限执行此操作。",
    "Name is required": "请输入姓名。",
    "Email is required": "请输入邮箱。",
    "Email must be valid": "请输入有效的邮箱地址。",
    "Password is required": "请输入密码。",
    "Password must be at least 6 characters": "密码至少需要 6 个字符。",
    "Title is required": "请输入岗位名称。",
    "Title must be at most 255 characters": "岗位名称不能超过 255 个字符。",
    "Description is required": "请输入岗位描述。",
    "Description must be at most 2000 characters": "岗位描述不能超过 2000 个字符。",
    "Company is required": "请输入公司名称。",
    "Company must be at most 255 characters": "公司名称不能超过 255 个字符。",
    "Cannot delete job with existing applications": "已有投递记录的岗位不能删除，请先关闭岗位。",
    "Cannot apply to a closed job": "该岗位已关闭，无法投递。",
    "Application already exists for this user and job": "你已经投递过该岗位。",
    "Applicants can only set application status to WITHDRAWN": "求职者只能撤回自己的投递。",
    "You are not allowed to access this application": "你没有权限查看这条投递记录。",
    "Admins can only manage applicant users": "管理员只能管理求职者账号。",
    "User name already exists": "该用户名已被使用。",
    "User email already exists": "该邮箱已注册。",
    "Enabled is required": "请选择账号状态。",
    "Invalid request": "提交内容有误，请检查后重试。",
    "Request failed": "请求失败，请稍后重试。",
    "Only valid PDF or DOCX resume files are allowed": "仅支持内容有效的 PDF 或 DOCX 简历。",
    "Resume file must not exceed 5 MiB": "简历文件不能超过 5 MiB。",
    "Resume file must not be empty": "简历文件不能为空。",
    "Resume storage is temporarily unavailable": "简历存储暂时不可用，请稍后重试。"
};

const apiMessagePatterns = [
    [/^Job with id .+ was not found$/, "未找到该岗位。"],
    [/^Application with id .+ was not found$/, "未找到该投递记录。"],
    [/^User with id .+ was not found$/, "未找到该用户。"],
    [/^User not found$/, "未找到该用户。"]
];

export const formatStatus = (status, emptyLabel = "未知") => {
    if (!status) {
        return emptyLabel;
    }

    return statusLabels[status] || status;
};

export const localizeApiMessage = (message, fallbackMessage = "请求失败，请稍后重试。") => {
    if (typeof message !== "string" || !message.trim()) {
        return fallbackMessage;
    }

    const normalizedMessage = message.trim();
    if (apiMessageTranslations[normalizedMessage]) {
        return apiMessageTranslations[normalizedMessage];
    }

    const matchingPattern = apiMessagePatterns.find(([pattern]) => pattern.test(normalizedMessage));
    return matchingPattern ? matchingPattern[1] : fallbackMessage;
};
