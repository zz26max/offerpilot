/**
 * Formatter for job date and time.
 */
const jobDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
});

/**
 * Formats the job's posted date for display.
 *
 * @param {Object} job - The job object.
 * @returns {string} The formatted date string.
 */
const formatJobPostedAt = (job) => {
    const timestamp = job.createdAt || job.postedDate;

    if (!timestamp) {
        return "今天发布";
    }

    const parsedDate = new Date(timestamp);
    if (Number.isNaN(parsedDate.getTime())) {
        return timestamp;
    }

    return jobDateTimeFormatter.format(parsedDate);
};

/**
 * Returns the CSS class name for a job card based on its status.
 *
 * @param {string} jobStatus - The status of the job (e.g., "OPEN", "CLOSED").
 * @returns {string} The CSS class name.
 */
const getJobCardStatusClass = (jobStatus) => {
    return jobStatus === "CLOSED" ? "job-card-closed" : "job-card-open";
};

/**
 * AdminJobList component displays a list of jobs with administrative actions.
 *
 * @param {Object} props - The component props.
 * @param {Array<Object>} props.jobs - List of job objects to display.
 * @param {string|number|null} props.deletingJobId - ID of the job currently being deleted.
 * @param {Function} props.formatStatus - Function to format status strings for display.
 * @param {Function} props.getApplicationCount - Function to get the number of applications for a job ID.
 * @param {Function} props.onEdit - Callback when the Edit button is clicked.
 * @param {Function} props.onDelete - Callback when the Delete button is clicked.
 * @param {Function} props.onUpdateJobStatus - Callback when the status toggle button is clicked.
 * @param {string|number|null} props.updatingJobStatusId - ID of the job currently being status-updated.
 * @returns {JSX.Element} The rendered component.
 */
const AdminJobList = ({
                          jobs,
                          deletingJobId,
                          formatStatus,
                          getApplicationCount,
                          onEdit,
                          onDelete,
                          onUpdateJobStatus,
                          updatingJobStatusId
                      }) => {
    if (jobs.length === 0) {
        return <p className="body-text">没有符合当前筛选条件的岗位。</p>;
    }

    return (
        <div className="row g-4">
            {jobs.map((job, index) => (
                <div className="col-md-6" key={job.id ?? `${job.title}-${index}`}>
                    <div className={`card job-card ${getJobCardStatusClass(job.status)}`}>
                        <div className="card-body">
                            <h4 className="heading-text">{job.title}</h4>
                            <p className="body-text">
                                <span className="metadata-label">岗位描述：</span>{job.description}
                            </p>
                            <p className="body-text">
                                <span className="metadata-label">公司：</span>{job.company}
                            </p>
                            <p className="body-text muted-meta">
                                <span className="metadata-label">发布时间：</span>{formatJobPostedAt(job)}
                            </p>
                            <p className="body-text">
                                <span className="metadata-label">岗位状态：</span>{formatStatus(job.status)}
                            </p>
                            <p className="body-text">
                                <span className="metadata-label">投递人数：</span>{getApplicationCount(job.id)}
                            </p>
                            <div className="d-flex gap-2 admin-card-actions">
                                <button
                                    type="button"
                                    className="btn btn-accent-secondary"
                                    onClick={() => onEdit(job)}
                                >
                                    编辑
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-secondary"
                                    disabled={updatingJobStatusId === job.id}
                                    onClick={() => onUpdateJobStatus(job.id, job.status === "CLOSED" ? "OPEN" : "CLOSED")}
                                >
                                    {updatingJobStatusId === job.id
                                        ? "正在保存…"
                                        : job.status === "CLOSED"
                                            ? "重新开放"
                                            : "关闭岗位"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline-danger"
                                    disabled={deletingJobId === job.id}
                                    onClick={() => onDelete(job.id)}
                                >
                                    {deletingJobId === job.id ? "正在删除…" : "删除"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AdminJobList;
