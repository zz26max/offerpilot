/**
 * Confirmation modal shown before an admin disables an applicant user.
 *
 * @param {Object} props - Component props.
 * @param {string} props.userLabel - Display name or email shown in the modal title.
 * @param {React.RefObject<HTMLButtonElement>} props.cancelButtonRef - Ref used by the parent to focus the safe action.
 * @param {Function} props.onCancel - Called when the admin cancels or closes the modal.
 * @param {Function} props.onConfirm - Called when the admin confirms the disable action.
 * @returns {JSX.Element} The rendered confirmation modal and backdrop.
 */
const AdminDisableUserModal = ({
    userLabel,
    cancelButtonRef,
    onCancel,
    onConfirm
}) => (
    <>
        <div
            className="modal fade show d-block"
            role="dialog"
            aria-modal="true"
            aria-labelledby="disable-user-modal-title"
        >
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header">
                        <h2 className="modal-title h5" id="disable-user-modal-title">
                            确认停用 {userLabel}？
                        </h2>
                        <button
                            type="button"
                            className="btn-close"
                            aria-label="关闭停用确认弹窗"
                            onClick={onCancel}
                        />
                    </div>
                    <div className="modal-body">
                        <p className="body-text mb-0">
                            停用后，该用户将立即退出登录，且无法再次登录。
                        </p>
                    </div>
                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            ref={cancelButtonRef}
                            onClick={onCancel}
                        >
                            取消
                        </button>
                        <button type="button" className="btn btn-danger" onClick={onConfirm}>
                            确认停用
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div className="modal-backdrop fade show"/>
    </>
);

export default AdminDisableUserModal;
