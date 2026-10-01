const AdminUsersPanel = ({
    users,
    emptyMessage = "暂无用户。",
    updatingUserId,
    formatStatus,
    onUpdateEnabled
}) => {
    if (users.length === 0) {
        return <div className="empty-state"><strong>{emptyMessage}</strong><span>调整搜索词、角色或账号状态后重试。</span></div>;
    }

    return (
        <div className="admin-record-list user-record-list">
            {users.map((user) => {
                const isApplicant = user.role === "APPLICANT";
                const isUpdating = updatingUserId === user.id;
                return (
                    <article className={`user-card admin-user-record ${user.enabled ? "user-card-enabled" : "user-card-disabled"}`} key={user.id}>
                        <div className="admin-record-main">
                            <div className="admin-record-title-row">
                                <div>
                                    <h4>{user.name}</h4>
                                    <p className="job-company"><span className="metadata-label">邮箱：</span>{user.email}</p>
                                </div>
                                <span className={`status-tag ${user.enabled ? "user-card-enabled" : "user-card-disabled"}`}>
                                    <span className="metadata-label">账号状态：</span>{user.enabled ? "已启用" : "已停用"}
                                </span>
                            </div>
                            <p className="body-text admin-user-role"><span className="metadata-label">角色：</span>{formatStatus(user.role)}</p>
                            {!isApplicant ? (
                                <p className="body-text muted-meta mt-3 mb-0">管理员账号仅支持查看。</p>
                            ) : null}
                        </div>
                        <div className="admin-card-actions">
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary"
                                        disabled={!isApplicant || isUpdating}
                                        onClick={() => onUpdateEnabled(user.id, !user.enabled)}
                                    >
                                        {isUpdating ? "正在保存…" : user.enabled ? "停用账号" : "启用账号"}
                                    </button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export default AdminUsersPanel;
