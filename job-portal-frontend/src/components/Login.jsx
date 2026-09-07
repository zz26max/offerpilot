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
    const location = useLocation();
    const registrationMessage = location.state?.registrationMessage || "";
    const sessionMessage = location.state?.sessionMessage || "";
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const processLogin = async () => {
        setErrorMessage("");

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
        }
    }


    return (
        <div className="page-shell d-flex align-items-center">
            <div className="container">
                <div className="row justify-content-center">
                    {/* Empty space for centering */}

                    <div className="col-lg-7 col-xl-6">
                        <div className="card login-panel p-4">
                            {/* Header */}
                            <div className="card-header login-header text-center">
                                <h3 className="mb-0 login-title">登录 OfferPilot</h3>
                            </div>

                            {/* Form */}
                            <div className="card-body">
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
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    processLogin()
                                }}>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="login-account-name">
                                            邮箱
                                        </label>
                                        <input
                                            id="login-account-name"
                                            type="email"
                                            className="form-control"
                                            placeholder="请输入邮箱"
                                            autoComplete="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                        <div className="form-text body-text">
                                            可使用演示账号：admin@local.test 或 user@local.test。
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label body-text" htmlFor="login-password">
                                            密码
                                        </label>
                                        <input
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
                                    <div className="text-center">
                                        <button type="submit" className="btn btn-accent-tertiary w-75">登录</button>
                                    </div>
                                </form>
                                <hr/>
                                <h6 className="text-center body-text">或</h6>
                                <div className="text-center mt-3">
                                    <button
                                        onClick={() => window.location.href = `${BACKEND_API_URL}/oauth2/authorization/google`}
                                        className="btn btn-accent-primary w-75">
                                        使用 Google 登录
                                    </button>

                                </div>
                            </div>

                            {/* Footer */}
                            <div className="card-footer login-footer text-center">
                                <small>还没有账号？<Link to="/register">立即注册</Link></small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
