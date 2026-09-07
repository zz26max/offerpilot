import {useCallback, useEffect, useRef, useState} from "react";
import axios from "axios";
import Navbar from "./Navbar";
import {BACKEND_API_URL} from "../config/backend";
import AdminJobForm from "./AdminJobForm";
import AdminJobList from "./AdminJobList";
import AdminApplicationsPanel from "./AdminApplicationsPanel";
import AdminUsersPanel from "./AdminUsersPanel";
import AdminDisableUserModal from "./AdminDisableUserModal";
import {useSessionTimeout} from "../auth/session";
import {formatStatus, localizeApiMessage} from "../i18n/messages";

/**
 * Initial empty state for the job form.
 */
const emptyForm = {
    title: "",
    description: "",
    company: ""
};

/**
 * List of valid application statuses.
 */
const applicationStatuses = ["APPLIED", "REVIEWING", "ACCEPTED", "REJECTED", "WITHDRAWN"];

/**
 * List of valid job statuses.
 */
const jobStatuses = ["OPEN", "CLOSED"];

const userRoleFilters = ["ALL", "ADMIN", "APPLICANT"];

const userStatusFilters = ["ALL", "ENABLED", "DISABLED"];

const adminLegends = {
    jobs: {
        ariaLabel: "岗位状态图例",
        items: [
            {label: "招聘中", className: "job-card-open"},
            {label: "已关闭", className: "job-card-closed"}
        ]
    },
    applications: {
        ariaLabel: "投递状态图例",
        items: [
            {label: "已投递", className: "application-card-applied"},
            {label: "筛选中", className: "application-card-reviewing"},
            {label: "已录用", className: "application-card-accepted"},
            {label: "未通过", className: "application-card-rejected"},
            {label: "已撤回", className: "application-card-withdrawn"}
        ]
    },
    users: {
        ariaLabel: "用户状态图例",
        items: [
            {label: "已启用", className: "user-card-enabled"},
            {label: "已停用", className: "user-card-disabled"}
        ]
    }
};

const getAdminLegend = (activeTab) => adminLegends[activeTab] || null;

const AdminLegend = ({legend}) => {
    if (!legend) {
        return null;
    }

    return (
        <div className="status-legend admin-status-legend" aria-label={legend.ariaLabel}>
            {legend.items.map((item) => (
                <span className="status-legend-item" key={item.label}>
                    <span className={`status-legend-swatch ${item.className}`} aria-hidden="true"></span>
                    <span>{item.label}</span>
                </span>
            ))}
        </div>
    );
};

/**
 * Tabs available in the Admin Dashboard.
 */
const adminTabs = [
    {id: "jobs", label: "岗位管理"},
    {id: "add-job", label: "发布岗位"},
    {id: "applications", label: "投递管理"},
    {id: "users", label: "用户管理"}
];

/**
 * Extracts a user-friendly error message from an API error response.
 *
 * @param {Object} error - The error object from axios.
 * @param {string} fallbackMessage - Message to return if no specific error can be identified.
 * @returns {string} The error message.
 */
const getApiErrorMessage = (error, fallbackMessage) => {
    const status = error?.response?.status;
    const backendMessage = error?.response?.data?.message;

    if (status === 401) {
        return localizeApiMessage(backendMessage, "登录状态已失效，请重新登录。");
    }

    if (status === 403) {
        return localizeApiMessage(backendMessage, "只有管理员可以执行此操作。");
    }

    if (status === 400 && backendMessage) {
        return localizeApiMessage(backendMessage, fallbackMessage);
    }

    if (status === 409) {
        return localizeApiMessage(backendMessage, fallbackMessage);
    }

    return localizeApiMessage(backendMessage, fallbackMessage);
};

/**
 * Parses a timestamp into a numerical value for sorting.
 *
 * @param {string|number} timestamp - The timestamp to parse.
 * @returns {number} The time in milliseconds, or 0 if invalid.
 */
const parseSortableTimestamp = (timestamp) => {
    if (!timestamp) {
        return 0;
    }

    const normalizedTimestamp = typeof timestamp === "string"
        ? timestamp.trim().replace(" ", "T")
        : timestamp;
    const parsedDate = new Date(normalizedTimestamp);
    return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
};

const getUserLabel = (user) => user?.name || user?.email;

const buildStatusSelections = (items) => {
    return items.reduce((lookup, application) => {
        lookup[application.id] = application.status;
        return lookup;
    }, {});
};

/**
 * AdminDashboard component serves as the main administrative interface.
 * It allows admins to manage job postings and view/update job applications.
 *
 * @returns {JSX.Element} The rendered AdminDashboard component.
 */
const AdminDashboard = () => {
    const handleSessionTimeout = useSessionTimeout();
    const [jobs, setJobs] = useState([]);
    const [applications, setApplications] = useState([]);
    const [users, setUsers] = useState([]);
    const [jobSearchTerm, setJobSearchTerm] = useState("");
    const [jobFilterStatus, setJobFilterStatus] = useState("ALL");
    const [jobSortOrder, setJobSortOrder] = useState("newest");
    const [applicationSearchTerm, setApplicationSearchTerm] = useState("");
    const [applicationFilterStatus, setApplicationFilterStatus] = useState("ALL");
    const [applicationSortOrder, setApplicationSortOrder] = useState("newest");
    const [userSearchTerm, setUserSearchTerm] = useState("");
    const [userRoleFilter, setUserRoleFilter] = useState("ALL");
    const [userStatusFilter, setUserStatusFilter] = useState("ALL");
    const [statusSelections, setStatusSelections] = useState({});
    const [activeTab, setActiveTab] = useState("jobs");
    const [form, setForm] = useState(emptyForm);
    const [editingJobId, setEditingJobId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingJobId, setDeletingJobId] = useState(null);
    const [updatingJobStatusId, setUpdatingJobStatusId] = useState(null);
    const [updatingApplicationId, setUpdatingApplicationId] = useState(null);
    const [updatingUserId, setUpdatingUserId] = useState(null);
    const [pendingDisableUser, setPendingDisableUser] = useState(null);
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const disableModalCancelRef = useRef(null);
    const disableReturnFocusRef = useRef(null);

    useEffect(() => {
        if (!pendingDisableUser) {
            return undefined;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        disableModalCancelRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                cancelDisableUser();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [pendingDisableUser]);

    const loadAdminData = useCallback(async () => {
        try {
            const requestConfig = {
                headers: {
                    Authorization: "Bearer " + localStorage.getItem("token")
                }
            };
            const [jobsResponse, applicationsResponse, usersResponse] = await Promise.all([
                axios.get(BACKEND_API_URL + "/api/jobs/admin", requestConfig),
                axios.get(BACKEND_API_URL + "/api/applications", requestConfig),
                axios.get(BACKEND_API_URL + "/api/users/admin", requestConfig)
            ]);
            setJobs(jobsResponse.data);
            setApplications(applicationsResponse.data);
            setUsers(usersResponse.data);
            setStatusSelections(buildStatusSelections(applicationsResponse.data));
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            setErrorMessage("暂时无法加载管理数据，请刷新页面后重试。");
        }
    }, [handleSessionTimeout]);

    useEffect(() => {
        loadAdminData();
    }, [loadAdminData]);

    const getApplicationCount = (jobId) => applications.filter((application) => application?.job?.id === jobId).length;
    const openJobsCount = jobs.filter((job) => job.status === "OPEN").length;
    const closedJobsCount = jobs.filter((job) => job.status === "CLOSED").length;
    const activeLegend = getAdminLegend(activeTab);
    const applicationStatusSummary = applicationStatuses
        .map((status) => `${formatStatus(status)}: ${applications.filter((application) => application.status === status).length}`)
        .join(" ｜ ");
    const getTabLabel = (tab) => {
        if (tab.id === "jobs") {
            return `${tab.label} (${jobs.length})`;
        }

        if (tab.id === "applications") {
            return `${tab.label} (${applications.length})`;
        }

        if (tab.id === "users") {
            return `${tab.label} (${users.length})`;
        }

        return tab.label;
    };

    const visibleJobs = jobs
        .filter((job) => {
            const matchesStatus = jobFilterStatus === "ALL" || job.status === jobFilterStatus;
            const normalizedSearchTerm = jobSearchTerm.trim().toLowerCase();

            if (!normalizedSearchTerm) {
                return matchesStatus;
            }

            const title = job.title?.toLowerCase() || "";
            const company = job.company?.toLowerCase() || "";
            return matchesStatus && (title.includes(normalizedSearchTerm) || company.includes(normalizedSearchTerm));
        })
        .sort((left, right) => {
            const leftTimestamp = parseSortableTimestamp(left.createdAt || left.postedDate);
            const rightTimestamp = parseSortableTimestamp(right.createdAt || right.postedDate);

            if (jobSortOrder === "oldest") {
                return leftTimestamp - rightTimestamp;
            }

            return rightTimestamp - leftTimestamp;
        });

    const visibleApplications = applications
        .filter((application) => {
            const matchesStatus = applicationFilterStatus === "ALL" || application.status === applicationFilterStatus;
            const normalizedSearchTerm = applicationSearchTerm.trim().toLowerCase();

            if (!normalizedSearchTerm) {
                return matchesStatus;
            }

            const applicantName = application.user?.name?.toLowerCase() || "";
            const jobTitle = application.job?.title?.toLowerCase() || "";
            return matchesStatus && (applicantName.includes(normalizedSearchTerm) || jobTitle.includes(normalizedSearchTerm));
        })
        .sort((left, right) => {
            const leftTimestamp = parseSortableTimestamp(left.createdAt);
            const rightTimestamp = parseSortableTimestamp(right.createdAt);

            if (applicationSortOrder === "oldest") {
                return leftTimestamp - rightTimestamp;
            }

            return rightTimestamp - leftTimestamp;
        });

    const visibleUsers = users.filter((user) => {
        const normalizedSearchTerm = userSearchTerm.trim().toLowerCase();
        const matchesRole = userRoleFilter === "ALL" || user.role === userRoleFilter;
        const matchesStatus = userStatusFilter === "ALL"
            || (userStatusFilter === "ENABLED" && user.enabled)
            || (userStatusFilter === "DISABLED" && !user.enabled);

        if (!normalizedSearchTerm) {
            return matchesRole && matchesStatus;
        }

        const name = user.name?.toLowerCase() || "";
        const email = user.email?.toLowerCase() || "";
        return matchesRole && matchesStatus && (name.includes(normalizedSearchTerm) || email.includes(normalizedSearchTerm));
    });

    const handleChange = (event) => {
        const {name, value} = event.target;
        setForm((prev) => ({...prev, [name]: value}));
    };

    const handleApplicationStatusChange = (applicationId, status) => {
        setStatusSelections((prev) => ({
            ...prev,
            [applicationId]: status
        }));
    };

    const resetForm = () => {
        setForm(emptyForm);
        setEditingJobId(null);
    };

    const cancelEdit = () => {
        resetForm();
        setActiveTab("jobs");
    };

    const showRequestError = (error, fallbackMessage) => {
        setErrorMessage(getApiErrorMessage(error, fallbackMessage));
    };

    const saveJob = async (event) => {
        event.preventDefault();
        if (isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setStatusMessage("");
        setErrorMessage("");

        try {
            const requestConfig = {
                headers: {
                    Authorization: "Bearer " + localStorage.getItem("token")
                }
            };

            if (editingJobId) {
                const response = await axios.put(
                    `${BACKEND_API_URL}/api/jobs/${editingJobId}`,
                    form,
                    requestConfig
                );
                setJobs((prev) => prev.map((job) => job.id === editingJobId ? response.data : job));
                setStatusMessage("岗位信息已更新。");
            } else {
                const response = await axios.post(
                    BACKEND_API_URL + "/api/jobs",
                    form,
                    requestConfig
                );
                setJobs((prev) => [response.data, ...prev]);
                setStatusMessage("岗位发布成功。");
            }

            resetForm();
            setActiveTab("jobs");
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            showRequestError(error, editingJobId
                ? "暂时无法更新岗位，请稍后重试。"
                : "暂时无法发布岗位，请稍后重试。");
        } finally {
            setIsSubmitting(false);
        }
    };

    const startEdit = (job) => {
        setErrorMessage("");
        setStatusMessage("");
        setEditingJobId(job.id);
        setActiveTab("add-job");
        setForm({
            title: job.title,
            company: job.company,
            description: job.description
        });
    };

    const deleteJob = async (jobId) => {
        if (deletingJobId) {
            return;
        }

        const confirmed = window.confirm("确认删除这个岗位吗？此操作无法撤销。");
        if (!confirmed) {
            return;
        }

        setDeletingJobId(jobId);
        setErrorMessage("");
        setStatusMessage("");

        try {
            await axios.delete(`${BACKEND_API_URL}/api/jobs/${jobId}`, {
                headers: {
                    Authorization: "Bearer " + localStorage.getItem("token")
                }
            });
            setJobs((prev) => prev.filter((job) => job.id !== jobId));
            if (editingJobId === jobId) {
                resetForm();
            }
            setStatusMessage("岗位已删除。");
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            showRequestError(error, "暂时无法删除岗位，请稍后重试。");
        } finally {
            setDeletingJobId(null);
        }
    };

    const updateJobStatus = async (jobId, status) => {
        if (updatingJobStatusId) {
            return;
        }

        setUpdatingJobStatusId(jobId);
        setErrorMessage("");
        setStatusMessage("");

        try {
            const response = await axios.put(
                `${BACKEND_API_URL}/api/jobs/${jobId}/status`,
                null,
                {
                    params: {
                        status
                    },
                    headers: {
                        Authorization: "Bearer " + localStorage.getItem("token")
                    }
                }
            );
            setJobs((prev) => prev.map((job) => (
                job.id === jobId ? response.data : job
            )));
            setStatusMessage(status === "CLOSED"
                ? "岗位已关闭。"
                : "岗位已重新开放。");
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            showRequestError(error, "暂时无法更新岗位状态，请稍后重试。");
        } finally {
            setUpdatingJobStatusId(null);
        }
    };

    const updateApplicationStatus = async (applicationId) => {
        const status = statusSelections[applicationId];
        if (!status || updatingApplicationId) {
            return;
        }

        setUpdatingApplicationId(applicationId);
        setErrorMessage("");
        setStatusMessage("");

        try {
            const response = await axios.put(
                `${BACKEND_API_URL}/api/applications/${applicationId}`,
                null,
                {
                    params: {
                        status
                    },
                    headers: {
                        Authorization: "Bearer " + localStorage.getItem("token")
                    }
                }
            );
            setApplications((prev) => prev.map((application) => (
                application.id === applicationId
                    ? {
                        ...application,
                        ...response.data
                    }
                    : application
            )));
            setStatusSelections((prev) => ({
                ...prev,
                [applicationId]: response.data.status
            }));
            setStatusMessage("投递状态已更新。");
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            showRequestError(error, "暂时无法更新投递状态，请稍后重试。");
        } finally {
            setUpdatingApplicationId(null);
        }
    };

    const updateUserEnabled = async (userId, enabled) => {
        if (updatingUserId) {
            return;
        }

        const currentUser = users.find((user) => user.id === userId);
        setUpdatingUserId(userId);
        setErrorMessage("");
        setStatusMessage("");

        try {
            const response = await axios.put(
                `${BACKEND_API_URL}/api/users/admin/applicants/${userId}/enabled`,
                {enabled},
                {
                    headers: {
                        Authorization: "Bearer " + localStorage.getItem("token")
                    }
                }
            );
            setUsers((prev) => prev.map((user) => user.id === userId ? response.data : user));
            const userLabel = getUserLabel(response.data) || getUserLabel(currentUser) || "该用户";
            setStatusMessage(`${userLabel} 的账号已${enabled ? "启用" : "停用"}。`);
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            showRequestError(error, "暂时无法更新用户状态，请稍后重试。");
        } finally {
            setUpdatingUserId(null);
        }
    };

    const requestUserEnabledChange = (userId, enabled) => {
        if (!enabled) {
            const currentUser = users.find((user) => user.id === userId);
            disableReturnFocusRef.current = document.activeElement;
            setPendingDisableUser(currentUser || {id: userId});
            setErrorMessage("");
            setStatusMessage("");
            return;
        }

        updateUserEnabled(userId, enabled);
    };

    const cancelDisableUser = () => {
        const returnFocusTarget = disableReturnFocusRef.current;
        setPendingDisableUser(null);
        window.setTimeout(() => {
            returnFocusTarget?.focus?.();
        }, 0);
    };

    const confirmDisableUser = async () => {
        if (!pendingDisableUser) {
            return;
        }

        const userId = pendingDisableUser.id;
        setPendingDisableUser(null);
        disableReturnFocusRef.current = null;
        await updateUserEnabled(userId, false);
    };

    const pendingDisableUserLabel = getUserLabel(pendingDisableUser) || "该用户";

    return (
        <>
            <Navbar/>
            <div className="container dashboard-shell">
                <div className="admin-page-header">
                    <h1 className="mb-1">管理后台</h1>
                    <p className="body-text mb-0">集中管理岗位、投递进度和求职者账号。</p>
                </div>

                <div className="admin-summary-panel">
                    <div className="admin-stat-strip" aria-label="管理概览">
                        <span className="admin-stat-pill"><span>岗位总数</span><strong>{jobs.length}</strong></span>
                        <span className="admin-stat-pill"><span>招聘中</span><strong>{openJobsCount}</strong></span>
                        <span className="admin-stat-pill"><span>已关闭</span><strong>{closedJobsCount}</strong></span>
                        <span className="admin-stat-pill"><span>投递记录</span><strong>{applications.length}</strong></span>
                        <span className="admin-stat-pill"><span>用户数</span><strong>{users.length}</strong></span>
                    </div>
                    <AdminLegend legend={activeLegend}/>
                </div>

                {statusMessage ? (
                    <div className="alert alert-success" role="status">
                        {statusMessage}
                    </div>
                ) : null}
                {errorMessage ? (
                    <div className="alert alert-danger" role="alert">
                        {errorMessage}
                    </div>
                ) : null}

                <div className="mb-4">
                    <div className="nav nav-tabs admin-tabs" role="tablist" aria-label="管理功能">
                        {adminTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                className={`nav-link ${activeTab === tab.id ? "active" : ""}`}
                                aria-selected={activeTab === tab.id}
                                aria-controls={`admin-tab-panel-${tab.id}`}
                                id={`admin-tab-${tab.id}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {getTabLabel(tab)}
                            </button>
                        ))}
                    </div>
                </div>

                <div
                    id="admin-tab-panel-jobs"
                    role="tabpanel"
                    aria-labelledby="admin-tab-jobs"
                    hidden={activeTab !== "jobs"}
                >
                    <h2 className="section-title">岗位管理</h2>
                    <p className="body-text muted-meta admin-summary-text">招聘中：{openJobsCount} ｜
                        已关闭：{closedJobsCount}</p>
                    <div className="row g-2 mb-3 admin-filter-row">
                        <div className="col-md-5">
                            <label className="form-label body-text" htmlFor="job-search">搜索岗位</label>
                            <input
                                id="job-search"
                                className="form-control"
                                placeholder="按岗位名称或公司搜索"
                                value={jobSearchTerm}
                                onChange={(event) => setJobSearchTerm(event.target.value)}
                            />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label body-text" htmlFor="job-filter-status">岗位状态</label>
                            <select
                                id="job-filter-status"
                                className="form-select"
                                value={jobFilterStatus}
                                onChange={(event) => setJobFilterStatus(event.target.value)}
                            >
                                <option value="ALL">全部状态</option>
                                {jobStatuses.map((status) => (
                                    <option key={status} value={status}>
                                        {formatStatus(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label body-text" htmlFor="job-sort-order">岗位排序</label>
                            <select
                                id="job-sort-order"
                                className="form-select"
                                value={jobSortOrder}
                                onChange={(event) => setJobSortOrder(event.target.value)}
                            >
                                <option value="newest">最新发布优先</option>
                                <option value="oldest">最早发布优先</option>
                            </select>
                        </div>
                    </div>
                    <AdminJobList
                        jobs={visibleJobs}
                        deletingJobId={deletingJobId}
                        formatStatus={formatStatus}
                        getApplicationCount={getApplicationCount}
                        onEdit={startEdit}
                        onDelete={deleteJob}
                        onUpdateJobStatus={updateJobStatus}
                        updatingJobStatusId={updatingJobStatusId}
                    />
                </div>

                <div
                    id="admin-tab-panel-add-job"
                    role="tabpanel"
                    aria-labelledby="admin-tab-add-job"
                    hidden={activeTab !== "add-job"}
                >
                    <div className="row justify-content-center">
                        <div className="col-lg-8">
                            <AdminJobForm
                                form={form}
                                editingJobId={editingJobId}
                                isSubmitting={isSubmitting}
                                onChange={handleChange}
                                onSubmit={saveJob}
                                onCancelEdit={cancelEdit}
                            />
                        </div>
                    </div>
                </div>

                <div
                    id="admin-tab-panel-applications"
                    role="tabpanel"
                    aria-labelledby="admin-tab-applications"
                    hidden={activeTab !== "applications"}
                >
                    <h2 className="section-title">投递管理</h2>
                    <p className="body-text muted-meta admin-summary-text">{applicationStatusSummary}</p>
                    <AdminApplicationsPanel
                        applications={visibleApplications}
                        applicationStatuses={applicationStatuses}
                        filterStatus={applicationFilterStatus}
                        formatStatus={formatStatus}
                        searchTerm={applicationSearchTerm}
                        sortOrder={applicationSortOrder}
                        statusSelections={statusSelections}
                        updatingApplicationId={updatingApplicationId}
                        onFilterStatusChange={setApplicationFilterStatus}
                        onStatusChange={handleApplicationStatusChange}
                        onSaveStatus={updateApplicationStatus}
                        onSearchTermChange={setApplicationSearchTerm}
                        onSortOrderChange={setApplicationSortOrder}
                    />
                </div>

                <div
                    id="admin-tab-panel-users"
                    role="tabpanel"
                    aria-labelledby="admin-tab-users"
                    hidden={activeTab !== "users"}
                >
                    <h2 className="section-title">用户管理</h2>
                    <p className="body-text muted-meta admin-summary-text">
                        管理员账号仅支持查看；求职者账号可以启用或停用。
                    </p>
                    <p className="body-text muted-meta admin-summary-text">
                        停用账号后，用户将无法登录，已有登录状态也会立即失效。
                    </p>
                    <div className="row g-2 mb-3 admin-filter-row">
                        <div className="col-md-5">
                            <label className="form-label body-text" htmlFor="user-search">搜索用户</label>
                            <input
                                id="user-search"
                                className="form-control"
                                placeholder="按姓名或邮箱搜索"
                                value={userSearchTerm}
                                onChange={(event) => setUserSearchTerm(event.target.value)}
                            />
                        </div>
                        <div className="col-md-4">
                            <label className="form-label body-text" htmlFor="user-role-filter">用户角色</label>
                            <select
                                id="user-role-filter"
                                className="form-select"
                                value={userRoleFilter}
                                onChange={(event) => setUserRoleFilter(event.target.value)}
                            >
                                {userRoleFilters.map((role) => (
                                    <option key={role} value={role}>
                                        {role === "ALL" ? "全部角色" : formatStatus(role)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label body-text" htmlFor="user-status-filter">账号状态</label>
                            <select
                                id="user-status-filter"
                                className="form-select"
                                value={userStatusFilter}
                                onChange={(event) => setUserStatusFilter(event.target.value)}
                            >
                                {userStatusFilters.map((status) => (
                                    <option key={status} value={status}>
                                        {status === "ALL" ? "全部状态" : formatStatus(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <AdminUsersPanel
                        users={visibleUsers}
                        updatingUserId={updatingUserId}
                        emptyMessage={users.length === 0 ? "暂无用户。" : "没有符合当前筛选条件的用户。"}
                        formatStatus={formatStatus}
                        onUpdateEnabled={requestUserEnabledChange}
                    />
                </div>
            </div>
            {pendingDisableUser ? (
                <AdminDisableUserModal
                    userLabel={pendingDisableUserLabel}
                    cancelButtonRef={disableModalCancelRef}
                    onCancel={cancelDisableUser}
                    onConfirm={confirmDisableUser}
                />
            ) : null}
        </>
    );
};

export default AdminDashboard;
