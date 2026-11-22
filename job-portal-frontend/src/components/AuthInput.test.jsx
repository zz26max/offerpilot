import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {renderWithProviders} from "../test/test-utils";
import AuthInput from "./AuthInput";

const PasswordFields = () => {
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    return <>
        <label htmlFor="password">密码</label>
        <AuthInput id="password" name="password" icon="lock" type="password" value={password} onChange={(event) => setPassword(event.target.value)}/>
        <label htmlFor="confirmation">确认密码</label>
        <AuthInput id="confirmation" name="confirmPassword" icon="lock" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/>
    </>;
};

it("toggles each password independently without losing values or submitting", async () => {
    renderWithProviders(<PasswordFields/>);
    const user = userEvent.setup();
    const password = screen.getByLabelText("密码");
    const confirmation = screen.getByLabelText("确认密码");
    await user.type(password, "secret-value");
    await user.type(confirmation, "confirm-value");
    await user.click(screen.getByRole("button", {name: "显示密码"}));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("secret-value");
    expect(confirmation).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", {name: "隐藏密码"});
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Enter}");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("secret-value");
    await user.click(screen.getByRole("button", {name: "显示确认密码"}));
    expect(confirmation).toHaveAttribute("type", "text");
    expect(confirmation).toHaveValue("confirm-value");
});
