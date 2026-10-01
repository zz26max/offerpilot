import {useState} from "react";

/**
 * Default expanded state for application status sections.
 */
const defaultExpandedSections = {
    APPLIED: true,
    REVIEWING: true,
    ACCEPTED: false,
    REJECTED: false,
    WITHDRAWN: false
};

/**
 * Returns the CSS class name for an application card based on its status.
 *
 * @param {string} status - The status of the application.
 * @returns {string} The CSS class name.
 */
const getApplicationCardStatusClass = (status) => {
    switch (status) {
        case "REVIEWING":
            return "application-card-reviewing";
        case "ACCEPTED":
            return "application-card-accepted";
        case "REJECTED":
            return "application-card-rejected";
        case "WITHDRAWN":
            return "application-card-withdrawn";
        case "APPLIED":
        default:
            return "application-card-applied";
    }
};

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
 * Returns true if the created and updated timestamps are different.
 *
 * @param {string|number|Date} createdAt - The creation timestamp.
 * @param {string|number|Date} updatedAt - The last update timestamp.
 * @returns {boolean} True if the timestamps are different, false otherwise.
 */
const shouldShowLastUpdated = (createdAt, updatedAt) => {
    if (!createdAt || !updatedAt) {
        return false;
    }

    return new Date(createdAt).getTime() !== new Date(updatedAt).getTime();
};

/**
 * AdminApplicationsPanel component displays a list of job applications grouped by status.
 * It provides filtering, searching, sorting, and the ability to update application statuses.
 *
 * @param {Object} props - The component props.
 * @param {Array<Object>} props.applications - List of application objects.
 * @param {Array<string>} props.applicationStatuses - List of possible application statuses.
 * @param {string} props.filterStatus - Currently selected status filter.
 * @param {Function} props.formatStatus - Function to format status strings for display.
 * @param {string} props.searchTerm - Current search term.
 * @param {string} props.sortOrder - Current sort order.
 * @param {Object} props.statusSelections - Map of application IDs to their selected status in the UI.
 * @param {string|number|null} props.updatingApplicationId - ID of the application currently being updated.
 * @param {Function} props.onFilterStatusChange - Callback when the status filter changes.
 * @param {Function} props.onStatusChange - Callback when an individual application's status selection changes.
 * @param {Function} props.onSaveStatus - Callback to save the status change for an application.
 * @param {Function} props.onSearchTermChange - Callback when the search term changes.
 * @param {Function} props.onSortOrderChange - Callback when the sort order changes.
 * @returns {JSX.Element} The rendered component.
 */
const AdminApplicationsPanel = ({
                                    applications,
                                    applicationStatuses,
                                    filterStatus,
                                    formatStatus,
                                    searchTerm,
                                    sortOrder,
                                    statusSelections,
                                    updatingApplicationId,
                                    onFilterStatusChange,
                                    onStatusChange,
                                    onSaveStatus,
                                    onSearchTermChange,
                                    onSortOrderChange
                                }) => {
    const [expandedSections, setExpandedSections] = useState(defaultExpandedSections);

    const toggleSection = (status) => {
        setExpandedSections((prev) => ({
            ...prev,
            [status]: !prev[status]
        }));
    };

    const groupedApplications = applicationStatuses.reduce((groups, status) => {
        const matchingApplications = applications.filter((application) => application.status === status);
        if (matchingApplications.length > 0) {
            groups.push({
                status,
                applications: matchingApplications
            });
        }
        return groups;
    }, []);

    return (
        <>
            <div className="row g-2 mb-3 admin-filter-row">
                <div className="col-md-5">
                    <label className="form-label body-text" htmlFor="application-search">搜索投递记录</label>
                    <input
                        id="application-search"
                        className="form-control"
                        placeholder="按求职者或岗位名称搜索"
                        value={searchTerm}
                        onChange={(event) => onSearchTermChange(event.target.value)}
                    />
                </div>
                <div className="col-md-4">
                    <label className="form-label body-text" htmlFor="application-filter-status">投递状态</label>
                    <select
                        id="application-filter-status"
                        className="form-select"
                        value={filterStatus}
                        onChange={(event) => onFilterStatusChange(event.target.value)}
                    >
                        <option value="ALL">全部状态</option>
                        {applicationStatuses.map((status) => (
                            <option key={status} value={status}>
                                {formatStatus(status)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="col-md-3">
                    <label className="form-label body-text" htmlFor="application-sort-order">投递排序</label>
                    <select
                        id="application-sort-order"
                        className="form-select"
                        value={sortOrder}
                        onChange={(event) => onSortOrderChange(event.target.value)}
                    >
                        <option value="newest">最新投递优先</option>
                        <option value="oldest">最早投递优先</option>
                    </select>
                </div>
            </div>

            {groupedApplications.length === 0 ? (
                <div className="empty-state"><strong>没有符合当前筛选条件的投递记录。</strong><span>调整搜索词或投递状态后重试。</span></div>
            ) : (
                groupedApplications.map((group) => (
                    <div className="mb-4" key={group.status}
                         data-testid={`application-group-${group.status.toLowerCase()}`}>
                        <div
                            className="d-flex justify-content-between align-items-center mb-2 application-group-header">
                            <h3 className="section-title mb-0">
                                {formatStatus(group.status)} ({group.applications.length})
                            </h3>
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                aria-expanded={expandedSections[group.status] ?? false}
                                onClick={() => toggleSection(group.status)}
                            >
                                {(expandedSections[group.status] ?? false) ? `收起${formatStatus(group.status)}` : `展开${formatStatus(group.status)}`}
                            </button>
                        </div>
                        {(expandedSections[group.status] ?? false) ? (
                            <div className="admin-record-list application-record-list">
                                {group.applications.map((application) => (
                                    <article
                                        className={`application-card admin-application-record ${getApplicationCardStatusClass(application.status)}`}
                                        key={application.id}>
                                        <div className="admin-record-main">
                                            <div className="admin-record-title-row">
                                                <div>
                                                    <h4><span className="metadata-label">求职者：</span>{application.user?.name || "未知用户"}</h4>
                                                    <p className="job-company"><span className="metadata-label">岗位：</span>{application.job?.title || "未知岗位"}</p>
                                                </div>
                                                <span className={`status-tag ${getApplicationCardStatusClass(application.status)}`}>
                                                    <span className="metadata-label">当前状态：</span>{formatStatus(application.status)}
                                                </span>
                                            </div>
                                            <dl className="admin-record-metadata">
                                                {formatApplicationTimestamp(application.createdAt) ? (
                                                    <div><dt>投递时间：</dt><dd>{formatApplicationTimestamp(application.createdAt)}</dd></div>
                                                ) : null}
                                                {shouldShowLastUpdated(application.createdAt, application.updatedAt) ? (
                                                    <div><dt>更新时间：</dt><dd>{formatApplicationTimestamp(application.updatedAt)}</dd></div>
                                                ) : null}
                                            </dl>
                                        </div>
                                        <div className="application-status-controls">
                                            <label className="body-text mb-0" htmlFor={`application-status-${application.id}`}>
                                                调整状态
                                            </label>
                                                    <select
                                                        id={`application-status-${application.id}`}
                                                        className="form-select"
                                                        value={statusSelections[application.id] || application.status}
                                                        onChange={(event) => onStatusChange(application.id, event.target.value)}
                                                    >
                                                        {applicationStatuses.map((status) => (
                                                            <option key={status} value={status}>
                                                                {formatStatus(status)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="btn btn-accent-secondary"
                                                        disabled={updatingApplicationId === application.id}
                                                        onClick={() => onSaveStatus(application.id)}
                                                    >
                                                        {updatingApplicationId === application.id ? "正在保存…" : "保存"}
                                                    </button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ))
            )}
        </>
    );
};

export default AdminApplicationsPanel;
