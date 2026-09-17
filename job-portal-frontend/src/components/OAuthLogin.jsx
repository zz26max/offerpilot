import React, {useEffect} from "react";
import {useNavigate} from "react-router-dom";
import axios from "axios";
import {setUserDetails} from "../store/userActions";
import {useDispatch} from "react-redux";

import {BACKEND_API_URL} from "../config/backend";

/**
 * OAuthLogin component handles the redirect callback from an OAuth2 provider (e.g., Google).
 * It extracts the token or authorization code from the URL, exchanges it if necessary,
 * fetches user details, and redirects the user to the applicant dashboard.
 *
 * @returns {JSX.Element} The rendered component, typically a loading state.
 */
const OAuthLogin = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    useEffect(() => {
        // The backend places its application JWT in the fragment so it is not
        // sent in HTTP requests or referrer headers.
        const fragmentParams = new URLSearchParams(window.location.hash.slice(1));
        const tokenFromRedirect = fragmentParams.get("token");

        const finalizeLogin = (token) => {
            localStorage.setItem("token", token);
            axios.get(`${BACKEND_API_URL}/api/auth/details`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
                .then(response => {
                    const user = {
                        role: response.data.roles?.[0] || "",
                        username: response.data.username,
                        displayName: response.data.displayName || response.data.username
                    };
                    setUserDetails(dispatch)(user);
                    navigate("/applicant-dashboard");
                })
                .catch(error => {
                    console.error("Error fetching user details:", error);
                    alert("无法获取账号信息，请重新登录。");
                    navigate("/");
                });
        };

        if (tokenFromRedirect) {
            finalizeLogin(tokenFromRedirect);
            return;
        }

        alert("Google 登录未返回有效凭证，请重试。");
        navigate("/");
    }, [dispatch, navigate]);

    return (
        <div className="oauth-loading">
            <h2>正在登录…</h2>
        </div>
    );
};

export default OAuthLogin;
