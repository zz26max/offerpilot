import {useEffect, useRef, useState} from "react";
import Icon from "./Icon";
import {useDispatch, useSelector} from "react-redux";
import {Link, useNavigate} from "react-router-dom";
import {selectUser} from "../store/userSelectors";
import {setUserDetails} from "../store/userActions";

/**
 * Navbar component displays the application brand and user information, including a logout button.
 *
 * @returns {JSX.Element} The rendered Navbar component.
 */
const Navbar = () => {
    const user = useSelector(selectUser);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const triggerRef = useRef(null);
    const logoutRef = useRef(null);
    useEffect(() => {
        if (!menuOpen) return undefined;
        const closeOutside = (event) => {
            if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
        };
        const closeEscape = (event) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeEscape);
        };
    }, [menuOpen]);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.clear();
        let initialuserState = {
            username: "",
            displayName: "",
            role: ""
        }
        setUserDetails(dispatch)(initialuserState)
        navigate("/")

    }
    return (
        <>
            <nav className="navbar app-navbar" aria-label="主导航">
                <div className="container app-navbar-inner">
                    <Link className="navbar-brand brand-mark" to={user.role === "ROLE_ADMIN" ? "/admin-dashboard" : "/applicant-dashboard"}>
                        <span className="brand-symbol" aria-hidden="true"/>
                        <strong>OfferPilot</strong>
                    </Link>
                    <Link className="workspace-link" to={user.role === "ROLE_ADMIN" ? "/admin-dashboard" : "/applicant-dashboard"} aria-current="page"><Icon name="home"/>{user.role === "ROLE_ADMIN" ? "管理员工作台" : "求职者工作台"}</Link>
                    <div className="navbar-user-area" ref={menuRef} onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
                    }}>
                        <button type="button" className="user-menu-trigger" aria-label="用户菜单" ref={triggerRef} aria-expanded={menuOpen} aria-controls="user-actions" onClick={() => setMenuOpen(!menuOpen)} onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setMenuOpen(true);
                                requestAnimationFrame(() => logoutRef.current?.focus());
                            }
                        }}>
                            <span className="user-avatar"><Icon name="user"/></span>
                            <span className="welcome-text body-text" title={user.displayName || user.username}>你好，{user.displayName || user.username}</span>
                            <Icon name="chevron"/>
                        </button>
                        {menuOpen ? <div className="user-menu" id="user-actions">
                            <button ref={logoutRef} className="btn navbar-logout" onClick={handleLogout}>退出登录</button>
                        </div> : null}
                    </div>
                </div>
            </nav>
        </>
    )
}

export default Navbar;
