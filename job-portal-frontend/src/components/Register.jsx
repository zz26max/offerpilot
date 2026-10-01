import axios from "axios";
import {useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {BACKEND_API_URL} from "../config/backend";
import {localizeApiMessage} from "../i18n/messages";

const Register = () => {
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: ""
    });
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const handleChange = (event) => {
        const {name, value} = event.target;
        setForm((prev) => ({...prev, [name]: value}));
    };

    const registerApplicant = async () => {
        setErrorMessage("");

        if (form.password !== form.confirmPassword) {
            setErrorMessage("两次输入的密码不一致。");
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(BACKEND_API_URL + "/api/auth/register", {
                name: form.name,
                email: form.email,
                password: form.password
            });
            navigate("/", {
                state: {
                    registrationMessage: "注册成功，请使用邮箱和密码登录。"
                }
            });
        } catch (error) {
            setErrorMessage(localizeApiMessage(
                error?.response?.data?.message,
                "暂时无法创建账号，请稍后重试。"
            ));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="page-shell auth-page">
            <div className="container auth-container">
                <div className="login-panel">
                    <aside className="auth-brand-panel">
                        <div className="auth-brand-lockup">
                            <span className="auth-brand-symbol" aria-hidden="true">O</span>
                            <span>OfferPilot</span>
                        </div>
                        <div>
                            <p className="auth-eyebrow">从第一份记录开始</p>
                            <h1>让岗位、投递与简历<br/>保持清晰。</h1>
                            <p>创建求职者账号，统一查看岗位机会和每次投递的最新状态。</p>
                        </div>
                    </aside>
                    <section className="auth-form-panel" aria-labelledby="register-title">
                        <div className="login-header">
                            <p className="auth-form-kicker">创建账号</p>
                            <h2 className="login-title" id="register-title">注册求职者账号</h2>
                            <p className="auth-form-intro">填写以下信息即可开始使用。</p>
                        </div>
                        <div className="login-body">
                                {errorMessage ? (
                                    <div className="alert alert-danger" role="alert">
                                        {errorMessage}
                                    </div>
                                ) : null}
                                <form onSubmit={(event) => {
                                    event.preventDefault();
                                    registerApplicant();
                                }}>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="register-name">姓名</label>
                                        <input
                                            id="register-name"
                                            name="name"
                                            className="form-control"
                                            autoComplete="name"
                                            value={form.name}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="register-email">邮箱</label>
                                        <input
                                            id="register-email"
                                            name="email"
                                            type="email"
                                            className="form-control"
                                            autoComplete="email"
                                            value={form.email}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="register-password">密码</label>
                                        <input
                                            id="register-password"
                                            name="password"
                                            type="password"
                                            className="form-control"
                                            autoComplete="new-password"
                                            value={form.password}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="register-confirm-password">确认密码</label>
                                        <input
                                            id="register-confirm-password"
                                            name="confirmPassword"
                                            type="password"
                                            className="form-control"
                                            autoComplete="new-password"
                                            value={form.confirmPassword}
                                            onChange={handleChange}
                                            required
                                        />
                                    </div>
                                    <div className="d-grid">
                                        <button type="submit" className="btn btn-accent-primary" disabled={isSubmitting}>
                                            {isSubmitting ? "正在注册…" : "注册账号"}
                                        </button>
                                    </div>
                                </form>
                        </div>
                        <div className="login-footer">
                            <span>已有账号？</span><Link to="/">返回登录</Link>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
};

export default Register;
