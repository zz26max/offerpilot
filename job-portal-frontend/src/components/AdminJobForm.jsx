/**
 * AdminJobForm component provides a form to create or edit a job posting.
 *
 * @param {Object} props - The component props.
 * @param {Object} props.form - The form state object containing title, company, and description.
 * @param {string|number|null} props.editingJobId - The ID of the job being edited, or null if creating a new job.
 * @param {boolean} props.isSubmitting - Indicates if the form is currently being submitted.
 * @param {Function} props.onChange - Callback function for input change events.
 * @param {Function} props.onSubmit - Callback function for form submission.
 * @param {Function} props.onCancelEdit - Callback function to cancel editing and reset the form.
 * @returns {JSX.Element} The rendered component.
 */
const AdminJobForm = ({
                          form,
                          editingJobId,
                          isSubmitting,
                          onChange,
                          onSubmit,
                          onCancelEdit
                      }) => {
    return (
        <div className="card login-panel p-4">
            <div className="card-header login-header text-center">
                <h3 className="mb-0 login-title">{editingJobId ? "编辑岗位" : "发布新岗位"}</h3>
            </div>
            <div className="card-body">
                <form onSubmit={onSubmit}>
                    <div className="mb-3">
                        <label className="form-label body-text" htmlFor="job-title">岗位名称</label>
                        <input
                            id="job-title"
                            name="title"
                            className="form-control"
                            value={form.title}
                            onChange={onChange}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label body-text" htmlFor="job-company">公司名称</label>
                        <input
                            id="job-company"
                            name="company"
                            className="form-control"
                            value={form.company}
                            onChange={onChange}
                            required
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label body-text" htmlFor="job-description">岗位描述</label>
                        <textarea
                            id="job-description"
                            name="description"
                            className="form-control"
                            rows="5"
                            value={form.description}
                            onChange={onChange}
                            required
                        />
                    </div>
                    <div className="d-grid gap-2">
                        <button
                            type="submit"
                            className="btn btn-accent-primary w-100"
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? (editingJobId ? "正在保存…" : "正在发布…")
                                : (editingJobId ? "保存修改" : "发布岗位")}
                        </button>
                        {editingJobId ? (
                            <button
                                type="button"
                                className="btn btn-outline-secondary w-100"
                                onClick={onCancelEdit}
                            >
                                取消编辑
                            </button>
                        ) : null}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminJobForm;
