import {useCallback} from "react";
import {useDispatch} from "react-redux";
import {useNavigate} from "react-router-dom";
import {setUserDetails} from "../store/userActions";
import {localizeApiMessage} from "../i18n/messages";

export const emptyUserState = {
    username: "",
    displayName: "",
    role: ""
};

export const defaultSessionMessage = "登录状态已失效，请重新登录。";

export const getSessionMessage = (error) => {
    const backendMessage = error?.response?.data?.message;
    return localizeApiMessage(backendMessage, defaultSessionMessage);
};

export const isUnauthorizedError = (error) => error?.response?.status === 401;

export const clearStoredSession = (dispatch) => {
    localStorage.removeItem("token");
    setUserDetails(dispatch)(emptyUserState);
};

export const useSessionTimeout = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    return useCallback((error) => {
        if (!isUnauthorizedError(error)) {
            return false;
        }

        clearStoredSession(dispatch);
        navigate("/", {
            replace: true,
            state: {
                sessionMessage: getSessionMessage(error)
            }
        });
        return true;
    }, [dispatch, navigate]);
};
