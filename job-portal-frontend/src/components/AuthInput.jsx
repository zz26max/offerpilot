import {useState} from "react";
import Icon from "./Icon";

const AuthInput = ({type = "text", icon, ...props}) => {
    const [visible, setVisible] = useState(false);
    const isPassword = type === "password";
    return (
        <div className={`auth-input ${isPassword ? "auth-input-password" : ""}`}>
            <Icon name={icon}/>
            <input {...props} type={isPassword && visible ? "text" : type}/>
            {isPassword ? <button type="button" className="password-toggle" aria-label={`${visible ? "隐藏" : "显示"}${props.name === "confirmPassword" ? "确认密码" : "密码"}`} aria-pressed={visible} aria-controls={props.id} onClick={() => setVisible(!visible)}><Icon name="eye"/></button> : null}
        </div>
    );
};
export default AuthInput;
