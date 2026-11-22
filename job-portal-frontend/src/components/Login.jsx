import AuthBrand from "./AuthBrand";
import AuthInput from "./AuthInput";
//src/components/Login.jsx

import axios from "axios";
import React, {useState} from "react";
import {useDispatch} from "react-redux";
import {setUserDetails} from "../store/userActions";
import {Link, useLocation, useNavigate} from "react-router-dom";
import {BACKEND_API_URL} from '../config/backend'
import {localizeApiMessage} from "../i18n/messages";

const getLoginErrorMessage = (error) => {
    if (error?.response?.status === 401 && error.response.data?.message) {
        return localizeApiMessage(error.response.data.message, "邮箱或密码错误。");
    }

    return "登录失败，请检查邮箱和密码后重试。";
};

/**
 * Login component provides a user interface for authenticating with email and password,
 * or via Google OAuth2.
 *
 * @returns {JSX.Element} The rendered Login component.
 */
const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const location = useLocation();
    const registrationMessage = location.state?.registrationMessage || "";
    const sessionMessage = location.state?.sessionMessage || "";
    const googleOAuthEnabled = import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true";
    const oauthError = new URLSearchParams(location.search).get("oauth_error") === "true";
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const processLogin = async () => {
        if (isSubmitting) {
            return;
        }

        setErrorMessage("");
        setIsSubmitting(true);

        try {
            const response = await axios.post(BACKEND_API_URL + '/api/auth/login', {},
                {
                    headers: {
                        "Authorization": "Basic " + window.btoa(email + ":" + password)
                    }
                })
            let token = response.data.token;
            // save token in local storage
            localStorage.setItem('token', token);

            // fetch user details by passing this token in header
            const resp = await axios.get(BACKEND_API_URL + '/api/auth/details',
                {
                    headers: {
                        "Authorization": "Bearer " + token
                    }
                })
            console.log(resp.data)
            let user = {
                role: resp.data.roles[0],
                username: resp.data.username,
                displayName: resp.data.displayName
            }
            console.log(user)
            // call action function to dispatch user details to redux store
            setUserDetails(dispatch)(user)

            // navigate user to appropriate dashboard based on role

            switch (user.role) {
                case "ROLE_APPLICANT":
                    navigate("/applicant-dashboard")
                    break
                case "ROLE_ADMIN":
                    navigate("/admin-dashboard")
                    break
                default:
                    console.log("Invalid role")
            }

        } catch (error) {
            localStorage.removeItem('token');
            setErrorMessage(getLoginErrorMessage(error))
        } finally {
            setIsSubmitting(false);
        }
    }


    return (
        <main className="page-shell auth-page">
            <div className="container auth-container">
                <div className="login-panel">
                    <AuthBrand/>
                    <section className="auth-form-panel" aria-labelledby="login-title">
                        <div className="login-header">
                            <h1 className="login-title" id="login-title">登录 OfferPilot</h1>
                            <p className="auth-form-intro">使用账号继续管理你的求职进度。</p>
                        </div>
                        <div className="login-body">
                                {errorMessage ? (
                                    <div className="alert alert-danger" role="alert">
                                        {errorMessage}
                                    </div>
                                ) : null}
                                {registrationMessage ? (
                                    <div className="alert alert-success" role="status">
                                        {registrationMessage}
                                    </div>
                                ) : null}
                                {sessionMessage ? (
                                    <div className="alert alert-warning" role="status">
                                        {sessionMessage}
                                    </div>
                                ) : null}
                                {oauthError && googleOAuthEnabled && !errorMessage ? (
                                    <div className="alert alert-warning" role="status">
                                        Google 登录未完成，请重试或使用邮箱和密码登录。
                                    </div>
                                ) : null}
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    processLogin()
                                }}>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="login-account-name">
                                            邮箱
                                        </label>
                                        <AuthInput
                                            icon="mail"
                                            id="login-account-name"
                                            type="email"
                                            className="form-control"
                                            placeholder="请输入邮箱"
                                            autoComplete="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="login-password">
                                            密码
                                        </label>
                                        <AuthInput
                                            icon="lock"
                                            id="login-password"
                                            type="password"
                                            className="form-control"
                                            placeholder="请输入密码"
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="d-grid">
                                        <button type="submit" className="btn btn-accent-primary" disabled={isSubmitting}>
                                            {isSubmitting ? "正在登录…" : "登录"}
                                        </button>
                                    </div>
                                </form>
                                {googleOAuthEnabled ? (
                                    <>
                                        <div className="auth-divider"><span>或</span></div>
                                        <div className="d-grid">
                                            <button
                                                onClick={() => window.location.href = `${BACKEND_API_URL}/oauth2/authorization/google`}
                                                className="btn btn-outline-secondary auth-google-button">
                                                使用 Google 登录
                                            </button>
                                        </div>
                                    </>
                                ) : null}
                        </div>
                        <div className="login-footer">
                            <span>还没有账号？</span><Link to="/register">立即注册</Link>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
};

export default Login;
