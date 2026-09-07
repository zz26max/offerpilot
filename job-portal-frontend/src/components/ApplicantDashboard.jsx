import {useCallback, useEffect, useState} from "react";
import Navbar from "./Navbar";
import axios from "axios";
import {BACKEND_API_URL} from '../config/backend'
import {useSessionTimeout} from "../auth/session";
import {formatStatus, localizeApiMessage} from "../i18n/messages";

/**
 * Formatter for application date and time.
 */
const applicationDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
});

const applicationStatusLegend = [
    {status: null, label: "未投递", className: "application-card-not-applied"},
    {status: "APPLIED", label: "已投递", className: "application-card-applied"},
    {status: "REVIEWING", label: "筛选中", className: "application-card-reviewing"},
    {status: "ACCEPTED", label: "已录用", className: "application-card-accepted"},
    {status: "REJECTED", label: "未通过", className: "application-card-rejected"},
    {status: "WITHDRAWN", label: "已撤回", className: "application-card-withdrawn"}
];

/**
 * Returns the CSS class name for an applicant job card based on application status.
 *
 * @param {string|null|undefined} status - The application status.
 * @returns {string} The CSS class name.
 */
const getApplicantJobCardStatusClass = (status) => {
    switch (status) {
        case "APPLIED":
            return "application-card-applied";
        case "REVIEWING":
            return "application-card-reviewing";
        case "ACCEPTED":
            return "application-card-accepted";
        case "REJECTED":
            return "application-card-rejected";
        case "WITHDRAWN":
            return "application-card-withdrawn";
        default:
            return "application-card-not-applied";
    }
};

/**
 * Returns a helper text describing the current status of an application.
 *
 * @param {string} status - The application status.
 * @returns {string} The helper text.
 */
const getStatusHelperText = (status) => {
    switch (status) {
        case "APPLIED":
            return "简历已投递，等待招聘方处理。";
        case "REVIEWING":
            return "招聘方正在筛选你的投递。";
        case "ACCEPTED":
            return "恭喜，你已通过当前招聘流程。";
        case "REJECTED":
            return "本次投递暂未通过。";
        case "WITHDRAWN":
            return "投递已撤回，你可以再次投递。";
        default:
            return "你还没有投递这个岗位。";
    }
};

/**
 * Formats an application timestamp into a human-readable string.
 *
 * @param {string|number|Date} timestamp - The timestamp to format.
 * @returns {string|null} The formatted date string, the original timestamp if invalid, or null if timestamp is missing.
 */
const formatApplicationTimestamp = (timestamp) => {
    if (!timestamp) {
        return null;
    }

    const parsedDate = new Date(timestamp);
    if (Number.isNaN(parsedDate.getTime())) {
        return timestamp;
    }

    return applicationDateTimeFormatter.format(parsedDate);
};

/**
 * Determines if the "Last Updated" timestamp should be displayed.
 *
 * @param {string|number|Date} createdAt - The creation timestamp.
 * @param {string|number|Date} updatedAt - The last update timestamp.
 * @returns {boolean} True if the timestamps are different.
 */
const shouldShowLastUpdated = (createdAt, updatedAt) => {
    if (!createdAt || !updatedAt) {
        return false;
    }

    return new Date(createdAt).getTime() !== new Date(updatedAt).getTime();
};

/**
 * Helper to get the application associated with a specific job ID.
 *
 * @param {Object} applicationsByJobId - Lookup map of applications.
 * @param {string|number} jobId - The ID of the job.
 * @returns {Object|undefined} The application object if found.
 */
const getJobApplication = (applicationsByJobId, jobId) => applicationsByJobId[jobId];

/**
 * Checks if an application can be withdrawn.
 *
 * @param {Object} application - The application object.
 * @returns {boolean} True if the status is "APPLIED".
 */
const canWithdraw = (application) => application?.status === "APPLIED";

/**
 * Checks if a user can apply for a job.
 *
 * @param {Object} application - The existing application object, if any.
 * @returns {boolean} True if no application exists or if it was withdrawn.
 */
const canApply = (application) => !application || application.status === "WITHDRAWN";

const buildApplicationsLookup = (applications) => {
    return applications.reduce((lookup, application) => {
        const jobId = application?.job?.id;
        if (jobId != null) {
            lookup[jobId] = application;
        }
        return lookup;
    }, {});
};

/**
 * Returns the appropriate button label for a job action.
 *
 * @param {Object} application - The application object.
 * @param {boolean} isSubmitting - Whether an action is currently in progress.
 * @returns {string} The label for the action button.
 */
const getActionLabel = (application, isSubmitting) => {
    if (isSubmitting) {
        return canWithdraw(application) ? "正在撤回…" : "正在投递…";
    }

    if (!application) {
        return "立即投递";
    }

    if (application.status === "WITHDRAWN") {
        return "再次投递";
    }

    if (application.status === "APPLIED") {
        return "撤回投递";
    }

    return formatStatus(application.status);
};

/**
 * ApplicantDashboard component allows applicants to view available jobs and manage their applications.
 *
 * @returns {JSX.Element} The rendered component.
 */
const ApplicantDashboard = () => {
    const handleSessionTimeout = useSessionTimeout();

    const [jobs, setJobs] = useState([]);
    const [applicationsByJobId, setApplicationsByJobId] = useState({});
    const [submittingJobs, setSubmittingJobs] = useState({});
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const loadApplicantData = useCallback(async () => {
        try {
            const [jobsResponse, applicationsResponse] = await Promise.all([
                axios.get(BACKEND_API_URL + "/api/jobs"),
                axios.get(BACKEND_API_URL + "/api/applications", {
                    headers: {
                        Authorization: "Bearer " + localStorage.getItem("token")
                    }
                })
            ]);
            setJobs(jobsResponse.data);
            setApplicationsByJobId(buildApplicationsLookup(applicationsResponse.data));
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            setErrorMessage("暂时无法加载岗位和投递记录，请刷新页面后重试。");
        }
    }, [handleSessionTimeout]);

    useEffect(() => {
        loadApplicantData();
    }, [loadApplicantData]);

    const apply = async (jobId) => {
        const application = getJobApplication(applicationsByJobId, jobId);
        if (submittingJobs[jobId] || !canApply(application)) {
            return;
        }

        setStatusMessage("");
        setErrorMessage("");
        setSubmittingJobs((prev) => ({...prev, [jobId]: true}));
        try {
            const response = await axios.post(BACKEND_API_URL + "/api/applications/" + jobId,
                {}, {
                    headers: {
                        "Authorization": "Bearer " + localStorage.getItem("token")
                    }
                }
            );
            setApplicationsByJobId((prev) => ({
                ...prev,
                [jobId]: {
                    ...prev[jobId],
                    ...response.data
                }
            }));
            setStatusMessage("投递成功，祝你求职顺利！");
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            const backendMessage = error?.response?.data?.message;
            setErrorMessage(localizeApiMessage(
                backendMessage,
                "暂时无法投递，请稍后重试。"
            ));
        } finally {
            setSubmittingJobs((prev) => {
                const next = {...prev};
                delete next[jobId];
                return next;
            });
        }
    };

    const withdraw = async (jobId) => {
        const application = getJobApplication(applicationsByJobId, jobId);
        if (submittingJobs[jobId] || !canWithdraw(application)) {
            return;
        }

        setStatusMessage("");
        setErrorMessage("");
        setSubmittingJobs((prev) => ({...prev, [jobId]: true}));
        try {
            const response = await axios.put(
                `${BACKEND_API_URL}/api/applications/${application.id}`,
                null,
                {
                    params: {
                        status: "WITHDRAWN"
                    },
                    headers: {
                        Authorization: "Bearer " + localStorage.getItem("token")
                    }
                }
            );
            setApplicationsByJobId((prev) => ({
                ...prev,
                [jobId]: {
                    ...prev[jobId],
                    ...response.data
                }
            }));
            setStatusMessage("投递已撤回。你仍可以再次投递该岗位。");
        } catch (error) {
            if (handleSessionTimeout(error)) {
                return;
            }
            const backendMessage = error?.response?.data?.message;
            setErrorMessage(localizeApiMessage(
                backendMessage,
                "暂时无法撤回投递，请稍后重试。"
            ));
        } finally {
            setSubmittingJobs((prev) => {
                const next = {...prev};
                delete next[jobId];
                return next;
            });
        }
    };

    return (
        <>
            <Navbar/>
            <div className="container dashboard-shell">
                <h1 className="section-title">我的求职看板</h1>
                <div className="status-legend applicant-status-legend" aria-label="投递状态图例">
                    {applicationStatusLegend.map((item) => (
                        <span className="status-legend-item" key={item.label}>
                            <span className={`status-legend-swatch ${item.className}`} aria-hidden="true"></span>
                            <span>{item.label}</span>
                        </span>
                    ))}
                </div>
                {statusMessage ? <p className="body-text text-success">{statusMessage}</p> : null}
                {errorMessage ? <p className="body-text text-danger">{errorMessage}</p> : null}
                <div className="row g-4">
                    {
                        jobs.length === 0 ? (
                            <p className="body-text">暂无可投递岗位。</p>
                        ) : jobs.map((job, index) => (
                            (() => {
                                const application = getJobApplication(applicationsByJobId, job.id);
                                const isSubmitting = !!submittingJobs[job.id];
                                const actionAllowed = canApply(application) || canWithdraw(application);
                                const appliedOn = formatApplicationTimestamp(application?.createdAt);
                                const lastUpdated = shouldShowLastUpdated(application?.createdAt, application?.updatedAt)
                                    ? formatApplicationTimestamp(application?.updatedAt)
                                    : null;
                                const cardStatusClass = getApplicantJobCardStatusClass(application?.status);

                                return (
                                    <div className="col-12 col-md-6 col-xl-4" key={index}>
                                        <div className={`card job-card ${cardStatusClass}`}>
                                            <div className="card-body">
                                                <h4 className="heading-text">{job.title}</h4>
                                                <p className="body-text">
                                                    <span className="metadata-label">岗位描述：</span>{job.description}
                                                </p>
                                                <p className="body-text">
                                                    <span className="metadata-label">公司：</span>{job.company}
                                                </p>
                                                <p className="body-text muted-meta">
                                                    <span
                                                        className="metadata-label">发布时间：</span>{formatApplicationTimestamp(job.createdAt || job.postedDate)}
                                                </p>
                                                <p className="body-text">
                                                    <span
                                                        className="metadata-label">投递状态：</span>{formatStatus(applicationsByJobId[job.id]?.status, "未投递")}
                                                </p>
                                                {appliedOn ? (
                                                    <p className="body-text muted-meta">
                                                        <span className="metadata-label">投递时间：</span>{appliedOn}
                                                    </p>
                                                ) : null}
                                                {lastUpdated ? (
                                                    <p className="body-text muted-meta">
                                                        <span
                                                            className="metadata-label">更新时间：</span>{lastUpdated}
                                                    </p>
                                                ) : null}
                                                <p className="body-text muted-meta">
                                                    {getStatusHelperText(application?.status)}
                                                </p>
                                                <div>
                                                    <button
                                                        className="btn btn-accent-secondary"
                                                        disabled={!actionAllowed || isSubmitting}
                                                        onClick={() => canWithdraw(application) ? withdraw(job.id) : apply(job.id)}
                                                    >
                                                        {getActionLabel(application, isSubmitting)}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()
                        ))
                    }
                </div>

            </div>
        </>
    )
}

export default ApplicantDashboard;
