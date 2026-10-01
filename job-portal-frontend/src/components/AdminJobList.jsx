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
        return <div className="empty-state"><strong>没有符合当前筛选条件的岗位。</strong><span>调整搜索词或状态筛选后重试。</span></div>;
    }

    return (
        <div className="admin-record-list">
            {jobs.map((job, index) => (
                <article className={`job-card admin-job-record ${getJobCardStatusClass(job.status)}`} key={job.id ?? `${job.title}-${index}`}>
                    <div className="admin-record-main">
                        <div className="admin-record-title-row">
                            <div>
                                <h4>{job.title}</h4>
                                <p className="job-company"><span className="metadata-label">公司：</span>{job.company}</p>
                            </div>
                            <span className={`status-tag ${getJobCardStatusClass(job.status)}`}><span className="metadata-label">岗位状态：</span>{formatStatus(job.status)}</span>
                        </div>
                        <p className="job-description"><span className="metadata-label">岗位描述：</span>{job.description}</p>
                        <dl className="admin-record-metadata">
                            <div><dt>发布时间：</dt><dd>{formatJobPostedAt(job)}</dd></div>
                            <div><dt>投递人数：</dt><dd>{getApplicationCount(job.id)}</dd></div>
                        </dl>
                    </div>
                    <div className="admin-card-actions">
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
                </article>
            ))}
        </div>
    );
};

export default AdminJobList;
