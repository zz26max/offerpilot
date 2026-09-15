import {act, fireEvent, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import ResumePanel from "./ResumePanel";
import {formatContentType, MAX_RESUME_SIZE_BYTES} from "./resumePanelUtils";
import {renderWithProviders} from "../test/test-utils";

vi.mock("axios");

const queuedResume = {
    id: 7,
    originalFilename: "张三-前端工程师.pdf",
    contentType: "application/pdf",
    sizeBytes: 1536,
    sha256: "abc123",
    parseStatus: "QUEUED",
    attempts: 0,
    parsedAt: null,
    errorCode: null,
    createdAt: "2026-09-15T10:15:00",
    updatedAt: "2026-09-15T10:15:00"
};

const succeededResume = {
    ...queuedResume,
    parseStatus: "SUCCEEDED",
    attempts: 1,
    parsedAt: "2026-09-15T10:15:04",
    updatedAt: "2026-09-15T10:15:04"
};

const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, reject, resolve};
};

describe("ResumePanel", () => {
    const extractedTextMatcher = (_, element) => (
        element?.tagName === "PRE" && element.textContent === "张三\n前端工程师"
    );

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem("token", "jwt-resume");
    });

    it("maps canonical MIME values to readable formats with a safe unknown fallback", () => {
        expect(formatContentType("application/pdf")).toBe("PDF");
        expect(formatContentType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
            .toBe("DOCX");
        expect(formatContentType("application/x-private-format")).toBe("其他格式");
        expect(formatContentType(null)).toBe("—");
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("loads owner metadata with bearer authentication and renders status information", async () => {
        axios.get.mockResolvedValueOnce({data: [{
            ...queuedResume,
            parseStatus: "UPLOADED",
            attempts: 2,
            errorCode: "LEGACY_RECORD"
        }]});

        renderWithProviders(<ResumePanel/>);

        expect(screen.getByRole("status", {name: ""})).toHaveTextContent("正在加载简历记录");
        expect(await screen.findByText("张三-前端工程师.pdf")).toBeInTheDocument();
        expect(axios.get).toHaveBeenCalledWith("http://localhost:8080/api/resumes", {
            headers: {Authorization: "Bearer jwt-resume"}
        });
        expect(screen.getByText("历史记录")).toBeInTheDocument();
        expect(screen.getByText("历史上传记录尚未进入解析流程，如需解析请重新上传。")).toBeInTheDocument();
        expect(screen.getByText("PDF")).toHaveAttribute("title", "application/pdf");
        expect(screen.getByText("1.5 KiB")).toBeInTheDocument();
        expect(screen.getByText("失败次数")).toBeInTheDocument();
        expect(screen.getByText("LEGACY_RECORD")).toBeInTheDocument();
    });

    it("renders a helpful empty state", async () => {
        axios.get.mockResolvedValueOnce({data: []});

        renderWithProviders(<ResumePanel/>);

        expect(await screen.findByText("还没有上传过简历。")).toBeInTheDocument();
        expect(screen.getByText("选择上方的 PDF 或 DOCX 文件开始建立记录。")).toBeInTheDocument();
    });

    it("rejects unsupported, empty, oversized and multiple files before upload", async () => {
        axios.get.mockResolvedValueOnce({data: []});
        renderWithProviders(<ResumePanel/>);
        await screen.findByText("还没有上传过简历。");
        const input = screen.getByLabelText("选择简历文件");

        fireEvent.change(input, {target: {files: [new File(["text"], "resume.txt")]}});
        expect(screen.getByRole("alert")).toHaveTextContent("仅支持 PDF 或 DOCX 格式");

        fireEvent.change(input, {target: {files: [new File([], "resume.pdf", {type: "application/pdf"})]}});
        expect(screen.getByRole("alert")).toHaveTextContent("简历文件不能为空");

        const oversized = new File(
            [new Uint8Array(MAX_RESUME_SIZE_BYTES + 1)],
            "resume.docx",
            {type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
        );
        fireEvent.change(input, {target: {files: [oversized]}});
        expect(screen.getByRole("alert")).toHaveTextContent("不能超过 5 MiB");

        const pdf = new File(["%PDF-1.7"], "one.pdf", {type: "application/pdf"});
        const docx = new File(["zip"], "two.docx");
        fireEvent.change(input, {target: {files: [pdf, docx]}});
        expect(screen.getByRole("alert")).toHaveTextContent("每次只能上传一份简历");
        expect(axios.post).not.toHaveBeenCalled();
    });

    it("uploads FormData once, disables duplicate submission and resets the input", async () => {
        const upload = createDeferred();
        axios.get.mockResolvedValueOnce({data: []});
        axios.post.mockReturnValueOnce(upload.promise);
        renderWithProviders(<ResumePanel/>);
        const user = userEvent.setup();
        await screen.findByText("还没有上传过简历。");
        const input = screen.getByLabelText("选择简历文件");
        const file = new File(["%PDF-1.7"], "resume.pdf", {type: "application/pdf"});

        await user.upload(input, file);
        await user.click(screen.getByRole("button", {name: "上传简历"}));

        const submittingButton = screen.getByRole("button", {name: "正在上传…"});
        expect(submittingButton).toBeDisabled();
        fireEvent.click(submittingButton);
        expect(axios.post).toHaveBeenCalledTimes(1);
        const [url, body, config] = axios.post.mock.calls[0];
        expect(url).toBe("http://localhost:8080/api/resumes");
        expect(body).toBeInstanceOf(FormData);
        expect(body.get("file")).toBe(file);
        expect(config).toEqual({headers: {Authorization: "Bearer jwt-resume"}});
        expect(config.headers).not.toHaveProperty("Content-Type");

        await act(async () => upload.resolve({data: queuedResume}));
        expect(await screen.findByText("简历上传成功，系统正在准备解析。")).toBeInTheDocument();
        expect(input).toHaveValue("");
        expect(screen.getByText("张三-前端工程师.pdf")).toBeInTheDocument();
    });

    it("polls active parsing to success, stops afterwards, and cancels on unmount", async () => {
        vi.useFakeTimers();
        axios.get
            .mockResolvedValueOnce({data: [queuedResume]})
            .mockResolvedValueOnce({data: [succeededResume]});

        const view = renderWithProviders(<ResumePanel/>);
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(screen.getByText("等待解析")).toBeInTheDocument();
        expect(screen.getByText("每 2 秒自动更新状态")).toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(screen.getByText("解析完成")).toBeInTheDocument();
        expect(screen.queryByText("每 2 秒自动更新状态")).not.toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000);
        });
        expect(axios.get).toHaveBeenCalledTimes(2);

        view.unmount();
        await vi.advanceTimersByTimeAsync(4000);
        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it("pauses polling after a silent failure and resumes through manual retry", async () => {
        vi.useFakeTimers();
        axios.get
            .mockResolvedValueOnce({data: [queuedResume]})
            .mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce({data: [succeededResume]});
        renderWithProviders(<ResumePanel/>);
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(screen.getByRole("alert")).toHaveTextContent("自动刷新暂时中断");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6000);
        });
        expect(axios.get).toHaveBeenCalledTimes(2);

        fireEvent.click(screen.getByRole("button", {name: "重试"}));
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(axios.get).toHaveBeenCalledTimes(3);
        expect(screen.getByText("解析完成")).toBeInTheDocument();
    });

    it("loads extracted text only when expanded and reuses it after collapse", async () => {
        axios.get
            .mockResolvedValueOnce({data: [succeededResume]})
            .mockResolvedValueOnce({data: {...succeededResume, extractedText: "张三\n前端工程师"}});
        renderWithProviders(<ResumePanel/>);
        const user = userEvent.setup();
        const expandButton = await screen.findByRole("button", {name: "查看解析文本"});

        expect(screen.queryByText(extractedTextMatcher)).not.toBeInTheDocument();
        await user.click(expandButton);
        expect(await screen.findByText(extractedTextMatcher)).toBeInTheDocument();
        expect(axios.get).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/resumes/7", {
            headers: {Authorization: "Bearer jwt-resume"}
        });

        await user.click(screen.getByRole("button", {name: "收起解析文本"}));
        expect(screen.queryByText(extractedTextMatcher)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "查看解析文本"}));
        expect(screen.getByText(extractedTextMatcher)).toBeInTheDocument();
        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it("allows retrying a failed detail request", async () => {
        axios.get
            .mockResolvedValueOnce({data: [succeededResume]})
            .mockRejectedValueOnce(new Error("temporary"))
            .mockResolvedValueOnce({data: {...succeededResume, extractedText: "恢复后的文本"}});
        renderWithProviders(<ResumePanel/>);
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", {name: "查看解析文本"}));
        expect(await screen.findByText("暂时无法加载解析文本，请重试。")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "重试加载"}));
        expect(await screen.findByText("恢复后的文本")).toBeInTheDocument();
        expect(axios.get).toHaveBeenCalledTimes(3);
    });

    it("downloads a blob once and always revokes its object URL", async () => {
        const blob = new Blob(["resume"], {type: "application/pdf"});
        const download = createDeferred();
        axios.get
            .mockResolvedValueOnce({data: [succeededResume]})
            .mockReturnValueOnce(download.promise);
        const createObjectURL = vi.fn(() => "blob:resume-7");
        const revokeObjectURL = vi.fn();
        Object.defineProperty(URL, "createObjectURL", {configurable: true, value: createObjectURL});
        Object.defineProperty(URL, "revokeObjectURL", {configurable: true, value: revokeObjectURL});
        const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        renderWithProviders(<ResumePanel/>);
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", {name: "下载原文件"}));
        const downloadingButton = screen.getByRole("button", {name: "正在下载…"});
        expect(downloadingButton).toBeDisabled();
        fireEvent.click(downloadingButton);
        expect(axios.get).toHaveBeenCalledTimes(2);
        expect(axios.get).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/resumes/7/content", {
            headers: {Authorization: "Bearer jwt-resume"},
            responseType: "blob"
        });

        await act(async () => download.resolve({data: blob}));
        expect(createObjectURL).toHaveBeenCalledWith(blob);
        expect(anchorClick).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:resume-7");
    });

    it("uses the shared session-timeout flow for unauthorized resume requests", async () => {
        axios.get.mockRejectedValueOnce({
            response: {status: 401, data: {message: "Invalid session"}}
        });
        const {store} = renderWithProviders(<ResumePanel/>, {
            preloadedState: {
                user: {
                    username: "applicant@example.com",
                    displayName: "Applicant",
                    role: "ROLE_APPLICANT"
                }
            }
        });

        await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
        expect(store.getState().user).toEqual({username: "", displayName: "", role: ""});
        expect(screen.queryByText("暂时无法加载简历记录，请稍后重试。")).not.toBeInTheDocument();
    });
});
