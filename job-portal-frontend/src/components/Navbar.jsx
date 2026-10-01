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
                    <Link className="navbar-brand brand-mark" to="/">
                        <span className="brand-symbol" aria-hidden="true">O</span>
                        <strong>OfferPilot <span className="brand-product-name">求职管理平台</span></strong>
                    </Link>

                    <div className="navbar-user-area">
                        <span className="welcome-text body-text">你好，{user.displayName || user.username}</span>
                        <button className="btn btn-outline-secondary navbar-logout" onClick={handleLogout}>
                            退出登录
                        </button>
                    </div>
                </div>
            </nav>
        </>
    )
}

export default Navbar;
