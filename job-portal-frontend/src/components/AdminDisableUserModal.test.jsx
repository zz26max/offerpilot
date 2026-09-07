import {createRef} from "react";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminDisableUserModal from "./AdminDisableUserModal";

describe("AdminDisableUserModal", () => {
    it("should render the disable warning and wire modal actions", async () => {
        const user = userEvent.setup();
        const cancelButtonRef = createRef();
        const onCancel = vi.fn();
        const onConfirm = vi.fn();

        render(
            <AdminDisableUserModal
                userLabel="Rod Oliveira"
                cancelButtonRef={cancelButtonRef}
                onCancel={onCancel}
                onConfirm={onConfirm}
            />
        );

        expect(screen.getByRole("dialog", {name: "确认停用 Rod Oliveira？"})).toBeInTheDocument();
        expect(screen.getByText("停用后，该用户将立即退出登录，且无法再次登录。")).toBeInTheDocument();
        expect(cancelButtonRef.current).toBe(screen.getByRole("button", {name: "取消"}));

        await user.click(screen.getByRole("button", {name: "关闭停用确认弹窗"}));
        expect(onCancel).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole("button", {name: "取消"}));
        expect(onCancel).toHaveBeenCalledTimes(2);

        await user.click(screen.getByRole("button", {name: "确认停用"}));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
