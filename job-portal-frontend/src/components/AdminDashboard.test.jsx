import {screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import AdminDashboard from "./AdminDashboard";
import {renderWithProviders} from "../test/test-utils";

vi.mock("axios");
vi.mock("./Navbar", () => ({
    default: () => <div data-testid="navbar-mock">Navbar</div>
}));

const jobDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
});

const applicationDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
});

const tabNamePattern = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s\\(\\d+\\))?$`);

const openAdminTab = async (user, name) => {
    await user.click(screen.getByRole("tab", {name: tabNamePattern(name)}));
};

const openAddJobTab = async (user) => {
    await openAdminTab(user, "发布岗位");
};

const openApplicationsTab = async (user) => {
    await openAdminTab(user, "投递管理");
};

const openUsersTab = async (user) => {
    await openAdminTab(user, "用户管理");
};

const byTextContent = (text) => (_, element) => element?.textContent === text;

describe("AdminDashboard", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
        localStorage.clear();
        document.body.style.overflow = "";
        axios.get.mockResolvedValue({data: []});
    });

    it("should fetch and render jobs on mount", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-01-01",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "user"},
                        job: {id: 1, title: "Java Developer"}
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        name: "admin",
                        email: "admin@local.test",
                        role: "ADMIN",
                        enabled: true
                    },
                    {
                        id: 2,
                        name: "user",
                        email: "user@local.test",
                        role: "APPLICANT",
                        enabled: true
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);

        await waitFor(() => expect(axios.get).toHaveBeenCalledWith("http://localhost:8080/api/jobs/admin", {
            headers: {
                Authorization: "Bearer jwt-admin"
            }
        }));
        expect(axios.get).toHaveBeenCalledWith("http://localhost:8080/api/applications", {
            headers: {
                Authorization: "Bearer jwt-admin"
            }
        });
        expect(axios.get).toHaveBeenCalledWith("http://localhost:8080/api/users/admin", {
            headers: {
                Authorization: "Bearer jwt-admin"
            }
        });
        expect(screen.getByRole("heading", {name: "管理后台"})).toBeInTheDocument();
        expect(screen.getByRole("tab", {name: tabNamePattern("岗位管理")})).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", {name: "发布岗位"})).toBeInTheDocument();
        expect(screen.getByRole("tab", {name: tabNamePattern("投递管理")})).toBeInTheDocument();
        expect(screen.getByRole("tab", {name: tabNamePattern("用户管理")})).toBeInTheDocument();
        expect(screen.getByText(byTextContent("Java Developer"))).toBeInTheDocument();
        expect(screen.getByText(byTextContent("岗位状态：招聘中"))).toBeInTheDocument();
        expect(screen.getByText(byTextContent("投递人数：1"))).toBeInTheDocument();
        const summary = screen.getByLabelText("管理概览");
        expect(within(summary).getByText("岗位总数").closest(".admin-stat-pill")).toHaveTextContent("1");
        expect(within(summary).getByText("招聘中").closest(".admin-stat-pill")).toHaveTextContent("1");
        expect(within(summary).getByText("已关闭").closest(".admin-stat-pill")).toHaveTextContent("0");
        expect(within(summary).getByText("投递记录").closest(".admin-stat-pill")).toHaveTextContent("1");
        expect(within(summary).getByText("用户数").closest(".admin-stat-pill")).toHaveTextContent("2");
        expect(screen.getByLabelText("岗位状态图例")).toHaveTextContent("招聘中");
        expect(screen.getByLabelText("岗位状态图例")).toHaveTextContent("已关闭");
        expect(screen.getByText("招聘中：1 ｜ 已关闭：0")).toBeInTheDocument();
        expect(screen.getByText("已投递: 1 ｜ 筛选中: 0 ｜ 已录用: 0 ｜ 未通过: 0 ｜ 已撤回: 0")).toBeInTheDocument();
    });

    it("should clear the session when admin data loading returns unauthorized", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get.mockRejectedValueOnce({
            response: {
                status: 401,
                data: {
                    message: "Your account is disabled. Please contact an administrator."
                }
            }
        });

        const {store} = renderWithProviders(<AdminDashboard/>, {
            preloadedState: {
                user: {
                    username: "admin@local.test",
                    displayName: "Admin",
                    role: "ROLE_ADMIN"
                }
            }
        });

        await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
        expect(store.getState().user).toEqual({
            username: "",
            displayName: "",
            role: ""
        });
    });

    it("should switch between jobs, add job, and applications tabs", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-01-01",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "user"},
                        job: {id: 1, title: "Java Developer"}
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByText(byTextContent("Java Developer"))).toBeInTheDocument());
        expect(screen.getByRole("tab", {name: tabNamePattern("岗位管理")})).toHaveAttribute("aria-selected", "true");

        await openAddJobTab(user);
        expect(screen.getByRole("heading", {name: "发布新岗位"})).toBeInTheDocument();
        expect(screen.getByLabelText("岗位名称")).toBeInTheDocument();
        expect(screen.queryByLabelText(/状态图例/)).not.toBeInTheDocument();

        await openApplicationsTab(user);
        expect(screen.getByRole("heading", {name: "已投递 (1)"})).toBeInTheDocument();
        expect(screen.getByText(byTextContent("求职者：user"))).toBeInTheDocument();
        expect(screen.getByLabelText("投递状态图例")).toHaveTextContent("已投递");
        expect(screen.getByLabelText("投递状态图例")).toHaveTextContent("筛选中");
        expect(screen.getByLabelText("投递状态图例")).toHaveTextContent("已录用");
        expect(screen.getByLabelText("投递状态图例")).toHaveTextContent("未通过");
        expect(screen.getByLabelText("投递状态图例")).toHaveTextContent("已撤回");
    });

    it("should move focus and selection between admin tabs with the keyboard", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();
        const jobsTab = screen.getByRole("tab", {name: tabNamePattern("岗位管理")});
        const addTab = screen.getByRole("tab", {name: "发布岗位"});
        const usersTab = screen.getByRole("tab", {name: tabNamePattern("用户管理")});

        jobsTab.focus();
        await user.keyboard("{ArrowRight}");
        await waitFor(() => expect(addTab).toHaveFocus());
        expect(addTab).toHaveAttribute("aria-selected", "true");

        await user.keyboard("{End}");
        await waitFor(() => expect(usersTab).toHaveFocus());
        expect(usersTab).toHaveAttribute("aria-selected", "true");

        await user.keyboard("{Home}");
        await waitFor(() => expect(jobsTab).toHaveFocus());
        expect(jobsTab).toHaveAttribute("aria-selected", "true");
    });

    it("should show admin users as read-only and applicant users as enable-disable only", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        name: "admin",
                        email: "admin@local.test",
                        role: "ADMIN",
                        enabled: true
                    },
                    {
                        id: 2,
                        name: "Rod Oliveira",
                        email: "jrodolfo@gmail.com",
                        role: "APPLICANT",
                        enabled: true
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openUsersTab(user);

        expect(screen.getByText("管理员账号仅支持查看；求职者账号可以启用或停用。")).toBeInTheDocument();
        expect(screen.getByText("停用账号后，用户将无法登录，已有登录状态也会立即失效。")).toBeInTheDocument();
        expect(screen.queryByRole("heading", {name: "创建求职者"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "编辑"})).not.toBeInTheDocument();
        expect(screen.getByLabelText("用户状态图例")).toHaveTextContent("已启用");
        expect(screen.getByLabelText("用户状态图例")).toHaveTextContent("已停用");
        const adminCard = screen.getByText(byTextContent("admin")).closest(".user-card");
        expect(within(adminCard).getByText("管理员账号仅支持查看。")).toBeInTheDocument();
        expect(within(adminCard).getByRole("button", {name: "停用账号"})).toBeDisabled();

        const applicantCard = screen.getByText(byTextContent("Rod Oliveira")).closest(".user-card");
        expect(within(applicantCard).getByText(byTextContent("角色：求职者"))).toBeInTheDocument();
        expect(within(applicantCard).getByRole("button", {name: "停用账号"})).toBeEnabled();
    });

    it("should search and filter users without hiding the controls", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        name: "admin",
                        email: "admin@local.test",
                        role: "ADMIN",
                        enabled: true
                    },
                    {
                        id: 2,
                        name: "Alice Smith",
                        email: "alice@example.com",
                        role: "APPLICANT",
                        enabled: true
                    },
                    {
                        id: 3,
                        name: "Beta User",
                        email: "beta@example.com",
                        role: "APPLICANT",
                        enabled: false
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openUsersTab(user);

        const searchInput = screen.getByLabelText("搜索用户");
        const roleFilter = screen.getByLabelText("用户角色");
        const statusFilter = screen.getByLabelText("账号状态");

        await user.type(searchInput, "alice");
        expect(screen.getByText(byTextContent("Alice Smith"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("admin"))).not.toBeInTheDocument();
        expect(screen.queryByText(byTextContent("Beta User"))).not.toBeInTheDocument();

        await user.clear(searchInput);
        await user.type(searchInput, "beta@example.com");
        expect(screen.getByText(byTextContent("Beta User"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("Alice Smith"))).not.toBeInTheDocument();

        await user.clear(searchInput);
        await user.selectOptions(roleFilter, "APPLICANT");
        expect(screen.getByText(byTextContent("Alice Smith"))).toBeInTheDocument();
        expect(screen.getByText(byTextContent("Beta User"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("admin"))).not.toBeInTheDocument();

        await user.selectOptions(statusFilter, "DISABLED");
        expect(screen.getByText(byTextContent("Beta User"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("Alice Smith"))).not.toBeInTheDocument();

        await user.selectOptions(roleFilter, "ALL");
        await user.selectOptions(statusFilter, "ALL");
        await user.type(searchInput, "not-a-real-user");
        expect(screen.getByText("没有符合当前筛选条件的用户。")).toBeInTheDocument();
        expect(screen.getByLabelText("搜索用户")).toBeInTheDocument();
        expect(screen.getByLabelText("用户角色")).toBeInTheDocument();
        expect(screen.getByLabelText("账号状态")).toBeInTheDocument();
    });

    it("should disable applicant users from the users tab", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 2,
                        name: "Rod Oliveira",
                        email: "jrodolfo@gmail.com",
                        role: "APPLICANT",
                        enabled: true
                    }
                ]
            });
        axios.put.mockResolvedValueOnce({
            data: {
                id: 2,
                name: "Rod Oliveira",
                email: "jrodolfo@gmail.com",
                role: "APPLICANT",
                enabled: false
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openUsersTab(user);
        await user.click(screen.getByRole("button", {name: "停用账号"}));
        const dialog = screen.getByRole("dialog", {name: "确认停用 Rod Oliveira？"});
        expect(within(dialog).getByText("停用后，该用户将立即退出登录，且无法再次登录。")).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", {name: "确认停用"}));
        await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
            "http://localhost:8080/api/users/admin/applicants/2/enabled",
            {enabled: false},
            {
                headers: {
                    Authorization: "Bearer jwt-admin"
                }
            }
        ));
        expect(await screen.findByText("Rod Oliveira 的账号已停用。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("账号状态：已停用"))).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "启用账号"})).toBeInTheDocument();
    });

    it("should not disable applicant users when confirmation is canceled", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 2,
                        name: "Rod Oliveira",
                        email: "jrodolfo@gmail.com",
                        role: "APPLICANT",
                        enabled: true
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openUsersTab(user);
        const disableButton = screen.getByRole("button", {name: "停用账号"});
        await user.click(disableButton);
        const dialog = screen.getByRole("dialog", {name: "确认停用 Rod Oliveira？"});
        expect(within(dialog).getByText("停用后，该用户将立即退出登录，且无法再次登录。")).toBeInTheDocument();
        const cancelButton = within(dialog).getByRole("button", {name: "取消"});
        expect(cancelButton).toHaveFocus();
        expect(document.body.style.overflow).toBe("hidden");
        await user.click(cancelButton);

        expect(axios.put).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog", {name: "确认停用 Rod Oliveira？"})).not.toBeInTheDocument();
        await waitFor(() => expect(disableButton).toHaveFocus());
        expect(document.body.style.overflow).toBe("");
        expect(screen.getByText(byTextContent("账号状态：已启用"))).toBeInTheDocument();
    });

    it("should close the disable user modal with Escape and restore focus", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 2,
                        name: "Rod Oliveira",
                        email: "jrodolfo@gmail.com",
                        role: "APPLICANT",
                        enabled: true
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openUsersTab(user);
        const disableButton = screen.getByRole("button", {name: "停用账号"});
        await user.click(disableButton);

        const dialog = screen.getByRole("dialog", {name: "确认停用 Rod Oliveira？"});
        expect(within(dialog).getByRole("button", {name: "取消"})).toHaveFocus();
        expect(document.body.style.overflow).toBe("hidden");

        await user.keyboard("{Escape}");

        expect(axios.put).not.toHaveBeenCalled();
        expect(screen.queryByRole("dialog", {name: "确认停用 Rod Oliveira？"})).not.toBeInTheDocument();
        await waitFor(() => expect(disableButton).toHaveFocus());
        expect(document.body.style.overflow).toBe("");
    });

    it("should enable applicant users without confirmation", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 2,
                        name: "Rod Oliveira",
                        email: "jrodolfo@gmail.com",
                        role: "APPLICANT",
                        enabled: false
                    }
                ]
            });
        axios.put.mockResolvedValueOnce({
            data: {
                id: 2,
                name: "Rod Oliveira",
                email: "jrodolfo@gmail.com",
                role: "APPLICANT",
                enabled: true
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openUsersTab(user);
        await user.click(screen.getByRole("button", {name: "启用账号"}));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        await waitFor(() => expect(axios.put).toHaveBeenCalledWith(
            "http://localhost:8080/api/users/admin/applicants/2/enabled",
            {enabled: true},
            {
                headers: {
                    Authorization: "Bearer jwt-admin"
                }
            }
        ));
        expect(await screen.findByText("Rod Oliveira 的账号已启用。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("账号状态：已启用"))).toBeInTheDocument();
    });

    it("should show the posted date with time when a timestamp is available", async () => {
        localStorage.setItem("token", "jwt-admin");
        const createdAt = "2026-05-26T14:43:00Z";
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-26",
                        createdAt,
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<AdminDashboard/>);

        const expectedDateTime = jobDateTimeFormatter.format(new Date(createdAt));
        await waitFor(() => expect(screen.getByText(byTextContent(`发布时间：${expectedDateTime}`))).toBeInTheDocument());
    });

    it("should send create job request with bearer token and prepend the new job", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []});
        axios.post.mockResolvedValueOnce({
            data: {
                id: 10,
                title: "Platform Engineer",
                description: "Own internal services",
                company: "ACME",
                postedDate: "2026-05-25",
                status: "OPEN"
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openAddJobTab(user);
        await user.type(screen.getByLabelText("岗位名称"), "Platform Engineer");
        await user.type(screen.getByLabelText("公司名称"), "ACME");
        await user.type(screen.getByLabelText("岗位描述"), "Own internal services");
        await user.click(screen.getByRole("button", {name: "发布岗位"}));

        await waitFor(() =>
            expect(axios.post).toHaveBeenCalledWith(
                "http://localhost:8080/api/jobs",
                {
                    title: "Platform Engineer",
                    description: "Own internal services",
                    company: "ACME"
                },
                {
                    headers: {
                        Authorization: "Bearer jwt-admin"
                    }
                }
            )
        );

        expect(await screen.findByText("岗位发布成功。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("Platform Engineer"))).toBeInTheDocument();
        expect(screen.getByRole("tab", {name: tabNamePattern("岗位管理")})).toHaveAttribute("aria-selected", "true");
    });

    it("should enter edit mode and send update request with bearer token", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});
        axios.put.mockResolvedValueOnce({
            data: {
                id: 1,
                title: "Senior Java Developer",
                description: "Build platform APIs",
                company: "ACME",
                postedDate: "2026-05-25",
                status: "OPEN"
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole("button", {name: "编辑"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "编辑"}));
        expect(screen.getByRole("tab", {name: "发布岗位"})).toHaveAttribute("aria-selected", "true");

        const titleInput = screen.getByLabelText("岗位名称");
        await user.clear(titleInput);
        await user.type(titleInput, "Senior Java Developer");

        const descriptionInput = screen.getByLabelText("岗位描述");
        await user.clear(descriptionInput);
        await user.type(descriptionInput, "Build platform APIs");

        await user.click(screen.getByRole("button", {name: "保存修改"}));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith(
                "http://localhost:8080/api/jobs/1",
                {
                    title: "Senior Java Developer",
                    description: "Build platform APIs",
                    company: "ACME"
                },
                {
                    headers: {
                        Authorization: "Bearer jwt-admin"
                    }
                }
            )
        );

        expect(await screen.findByText("岗位信息已更新。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("Senior Java Developer"))).toBeInTheDocument();
        expect(screen.getByRole("tab", {name: tabNamePattern("岗位管理")})).toHaveAttribute("aria-selected", "true");
    });

    it("should return to the jobs tab when canceling edit mode", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole("button", {name: "编辑"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "编辑"}));
        expect(screen.getByRole("tab", {name: "发布岗位"})).toHaveAttribute("aria-selected", "true");

        await user.click(screen.getByRole("button", {name: "取消编辑"}));

        expect(screen.getByRole("tab", {name: tabNamePattern("岗位管理")})).toHaveAttribute("aria-selected", "true");
        expect(screen.queryByRole("button", {name: "取消编辑"})).not.toBeInTheDocument();
        expect(screen.getByText(byTextContent("Java Developer"))).toBeInTheDocument();
    });

    it("should show backend validation message when create fails with bad request", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({data: []});
        axios.post.mockRejectedValueOnce({
            response: {
                status: 400,
                data: {
                    message: "Title is required"
                }
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openAddJobTab(user);
        await user.type(screen.getByLabelText("岗位名称"), " ");
        await user.type(screen.getByLabelText("公司名称"), "ACME");
        await user.type(screen.getByLabelText("岗位描述"), "Own internal services");
        await user.click(screen.getByRole("button", {name: "发布岗位"}));

        expect(await screen.findByText("请输入岗位名称。")).toBeInTheDocument();
    });

    it("should show backend validation message when update fails with bad request", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});
        axios.put.mockRejectedValueOnce({
            response: {
                status: 400,
                data: {
                    message: "Description must be at most 2000 characters"
                }
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole("button", {name: "编辑"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "编辑"}));
        await user.click(screen.getByRole("button", {name: "保存修改"}));

        expect(await screen.findByText("岗位描述不能超过 2000 个字符。")).toBeInTheDocument();
    });

    it("should delete a job after confirmation", async () => {
        localStorage.setItem("token", "jwt-admin");
        vi.stubGlobal("confirm", vi.fn(() => true));
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});
        axios.delete.mockResolvedValueOnce({});

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole("button", {name: "删除"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "删除"}));

        await waitFor(() =>
            expect(axios.delete).toHaveBeenCalledWith(
                "http://localhost:8080/api/jobs/1",
                {
                    headers: {
                        Authorization: "Bearer jwt-admin"
                    }
                }
            )
        );

        expect(await screen.findByText("岗位已删除。")).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("Java Developer"))).not.toBeInTheDocument();
    });

    it("should show the backend conflict message when deleting a job with applications", async () => {
        localStorage.setItem("token", "jwt-admin");
        vi.stubGlobal("confirm", vi.fn(() => true));
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});
        axios.delete.mockRejectedValueOnce({
            response: {
                status: 409,
                data: {
                    message: "Cannot delete job with existing applications"
                }
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole("button", {name: "删除"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "删除"}));

        expect(await screen.findByText("已有投递记录的岗位不能删除，请先关闭岗位。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("Java Developer"))).toBeInTheDocument();
    });

    it("should close and reopen a job with the admin status action", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});
        axios.put
            .mockResolvedValueOnce({
                data: {
                    id: 1,
                    title: "Java Developer",
                    description: "Build APIs",
                    company: "ACME",
                    postedDate: "2026-05-25",
                    status: "CLOSED"
                }
            })
            .mockResolvedValueOnce({
                data: {
                    id: 1,
                    title: "Java Developer",
                    description: "Build APIs",
                    company: "ACME",
                    postedDate: "2026-05-25",
                    status: "OPEN"
                }
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole("button", {name: "关闭岗位"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "关闭岗位"}));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith(
                "http://localhost:8080/api/jobs/1/status",
                null,
                {
                    params: {
                        status: "CLOSED"
                    },
                    headers: {
                        Authorization: "Bearer jwt-admin"
                    }
                }
            )
        );

        expect(await screen.findByText("岗位已关闭。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("岗位状态：已关闭"))).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "重新开放"})).toBeInTheDocument();

        const closedCard = screen.getByText(byTextContent("Java Developer")).closest(".job-card");
        expect(closedCard).toHaveClass("job-card-closed");

        await user.click(screen.getByRole("button", {name: "重新开放"}));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith(
                "http://localhost:8080/api/jobs/1/status",
                null,
                {
                    params: {
                        status: "OPEN"
                    },
                    headers: {
                        Authorization: "Bearer jwt-admin"
                    }
                }
            )
        );

        expect(await screen.findByText("岗位已重新开放。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("岗位状态：招聘中"))).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "关闭岗位"})).toBeInTheDocument();
        const reopenedCard = screen.getByText(byTextContent("Java Developer")).closest(".job-card");
        expect(reopenedCard).toHaveClass("job-card-open");
    });

    it("should filter jobs by status", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    },
                    {
                        id: 2,
                        title: "QA Engineer",
                        description: "Test releases",
                        company: "Globex",
                        postedDate: "2026-05-26",
                        status: "CLOSED"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByLabelText("岗位状态")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("岗位状态"), "CLOSED");

        expect(screen.getByText(byTextContent("QA Engineer"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("Java Developer"))).not.toBeInTheDocument();
    });

    it("should filter jobs by search term", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    },
                    {
                        id: 2,
                        title: "QA Engineer",
                        description: "Test releases",
                        company: "Globex",
                        postedDate: "2026-05-26",
                        status: "CLOSED"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByLabelText("搜索岗位")).toBeInTheDocument());
        await user.type(screen.getByLabelText("搜索岗位"), "glob");

        expect(screen.getByText(byTextContent("QA Engineer"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("Java Developer"))).not.toBeInTheDocument();
    });

    it("should sort jobs by oldest first", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Newer Job",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-26",
                        status: "OPEN"
                    },
                    {
                        id: 2,
                        title: "Older Job",
                        description: "Test releases",
                        company: "Globex",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByLabelText("岗位排序")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("岗位排序"), "oldest");

        const headings = screen.getAllByRole("heading", {level: 4}).map((element) => element.textContent);
        expect(headings[0]).toBe("Older Job");
        expect(headings[1]).toBe("Newer Job");
    });

    it("should show an empty state when no jobs match the current filters", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({data: []});

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByLabelText("搜索岗位")).toBeInTheDocument());
        await user.type(screen.getByLabelText("搜索岗位"), "does-not-match");

        expect(screen.getByText("没有符合当前筛选条件的岗位。")).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("Java Developer"))).not.toBeInTheDocument();
    });

    it("should update an application status and refresh the admin list", async () => {
        localStorage.setItem("token", "jwt-admin");
        const createdAt = "2026-05-25T10:00:00Z";
        const updatedAt = "2026-05-26T12:30:00Z";
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Java Developer",
                        description: "Build APIs",
                        company: "ACME",
                        postedDate: "2026-05-25"
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        createdAt,
                        user: {name: "user"},
                        job: {id: 1, title: "Java Developer"}
                    }
                ]
            });
        axios.put.mockResolvedValueOnce({
            data: {
                id: 10,
                status: "REVIEWING",
                updatedAt,
                user: {name: "user"},
                job: {id: 1, title: "Java Developer"}
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByLabelText("调整状态")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("调整状态"), "REVIEWING");
        await user.click(screen.getByRole("button", {name: "保存"}));

        await waitFor(() =>
            expect(axios.put).toHaveBeenCalledWith(
                "http://localhost:8080/api/applications/10",
                null,
                {
                    params: {
                        status: "REVIEWING"
                    },
                    headers: {
                        Authorization: "Bearer jwt-admin"
                    }
                }
            )
        );

        expect(await screen.findByText("投递状态已更新。")).toBeInTheDocument();
        expect(screen.getByText(byTextContent("当前状态：筛选中"))).toBeInTheDocument();
        expect(screen.getByText(byTextContent(`投递时间：${applicationDateTimeFormatter.format(new Date(createdAt))}`))).toBeInTheDocument();
        expect(screen.getByText(byTextContent(`更新时间：${applicationDateTimeFormatter.format(new Date(updatedAt))}`))).toBeInTheDocument();
    });

    it("should filter applications by status", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"},
                        createdAt: "2026-05-25T10:00:00"
                    },
                    {
                        id: 11,
                        status: "REVIEWING",
                        user: {name: "bob"},
                        job: {id: 2, title: "QA Engineer"},
                        createdAt: "2026-05-26T10:00:00"
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByLabelText("投递状态")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("投递状态"), "REVIEWING");

        expect(screen.getByRole("heading", {name: "筛选中 (1)"})).toBeInTheDocument();
        expect(screen.getByText(byTextContent("求职者：bob"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("求职者：alice"))).not.toBeInTheDocument();
    });

    it("should filter applications by search term", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"},
                        createdAt: "2026-05-25T10:00:00"
                    },
                    {
                        id: 11,
                        status: "REVIEWING",
                        user: {name: "bob"},
                        job: {id: 2, title: "QA Engineer"},
                        createdAt: "2026-05-26T10:00:00"
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByLabelText("搜索投递记录")).toBeInTheDocument());
        await user.type(screen.getByLabelText("搜索投递记录"), "qa");

        expect(screen.getByRole("heading", {name: "筛选中 (1)"})).toBeInTheDocument();
        expect(screen.getByText(byTextContent("求职者：bob"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("求职者：alice"))).not.toBeInTheDocument();
    });

    it("should keep application search controls visible when no results match", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"},
                        createdAt: "2026-05-25T10:00:00"
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByLabelText("搜索投递记录")).toBeInTheDocument());
        await user.type(screen.getByLabelText("搜索投递记录"), "nonexistent-user");

        expect(screen.getByText("没有符合当前筛选条件的投递记录。")).toBeInTheDocument();
        expect(screen.getByLabelText("搜索投递记录")).toBeInTheDocument();
        expect(screen.getByLabelText("投递状态")).toBeInTheDocument();

        await user.clear(screen.getByLabelText("搜索投递记录"));
        expect(screen.getByText(byTextContent("求职者：alice"))).toBeInTheDocument();
    });

    it("should group applications by status with counts", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"},
                        createdAt: "2026-05-26T10:00:00"
                    },
                    {
                        id: 11,
                        status: "REVIEWING",
                        user: {name: "bob"},
                        job: {id: 2, title: "QA Engineer"},
                        createdAt: "2026-05-25T10:00:00"
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByRole("heading", {name: "筛选中 (1)"})).toBeInTheDocument());
        expect(screen.getByRole("heading", {name: "已投递 (1)"})).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "筛选中 (1)"})).toBeInTheDocument();
        const appliedCard = screen.getByText(byTextContent("求职者：alice")).closest(".application-card");
        const reviewingCard = screen.getByText(byTextContent("求职者：bob")).closest(".application-card");
        expect(appliedCard).toHaveClass("application-card-applied");
        expect(reviewingCard).toHaveClass("application-card-reviewing");
    });

    it("should keep applied and reviewing groups expanded by default and historical groups collapsed", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"}
                    },
                    {
                        id: 11,
                        status: "ACCEPTED",
                        user: {name: "bob"},
                        job: {id: 2, title: "QA Engineer"}
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByRole("button", {name: "收起已投递"})).toBeInTheDocument());
        expect(screen.getByRole("button", {name: "展开已录用"})).toBeInTheDocument();
        expect(screen.getByText(byTextContent("求职者：alice"))).toBeInTheDocument();
        expect(screen.queryByText(byTextContent("求职者：bob"))).not.toBeInTheDocument();
    });

    it("should collapse and expand a status group", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"}
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByRole("button", {name: "收起已投递"})).toBeInTheDocument());
        await user.click(screen.getByRole("button", {name: "收起已投递"}));
        expect(screen.queryByText(byTextContent("求职者：alice"))).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "展开已投递"}));
        expect(screen.getByText(byTextContent("求职者：alice"))).toBeInTheDocument();
    });

    it("should move an updated application into the correct status group", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "user"},
                        job: {id: 1, title: "Java Developer"}
                    }
                ]
            });
        axios.put.mockResolvedValueOnce({
            data: {
                id: 10,
                status: "REVIEWING",
                user: {name: "user"},
                job: {id: 1, title: "Java Developer"}
            }
        });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByLabelText("调整状态")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("调整状态"), "REVIEWING");
        await user.click(screen.getByRole("button", {name: "保存"}));

        expect(await screen.findByText("投递状态已更新。")).toBeInTheDocument();
        expect(screen.queryByRole("heading", {name: "已投递 (1)"})).not.toBeInTheDocument();
        const reviewingGroup = screen.getByTestId("application-group-reviewing");
        expect(within(reviewingGroup).getByText(byTextContent("求职者：user"))).toBeInTheDocument();
    });

    it("should sort applications within groups by oldest first", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({data: []})
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"},
                        createdAt: "2026-05-26T10:00:00"
                    },
                    {
                        id: 11,
                        status: "APPLIED",
                        user: {name: "bob"},
                        job: {id: 2, title: "QA Engineer"},
                        createdAt: "2026-05-25T10:00:00"
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByLabelText("投递排序")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("投递排序"), "oldest");

        const headings = screen.getAllByRole("heading", {level: 4});
        expect(headings[0]).toHaveTextContent("求职者：bob");
        expect(headings[1]).toHaveTextContent("求职者：alice");
    });

    it("should sort jobs and applications correctly with MySQL-style timestamps", async () => {
        localStorage.setItem("token", "jwt-admin");
        axios.get
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 1,
                        title: "Newer Job",
                        description: "Own internal services",
                        company: "ACME",
                        createdAt: "2026-05-26 10:00:00",
                        status: "OPEN"
                    },
                    {
                        id: 2,
                        title: "Older Job",
                        description: "Maintain internal tooling",
                        company: "Globex",
                        createdAt: "2026-05-25 10:00:00",
                        status: "OPEN"
                    }
                ]
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: 10,
                        status: "APPLIED",
                        user: {name: "alice"},
                        job: {id: 1, title: "Java Developer"},
                        createdAt: "2026-05-26 10:00:00"
                    },
                    {
                        id: 11,
                        status: "APPLIED",
                        user: {name: "bob"},
                        job: {id: 2, title: "QA Engineer"},
                        createdAt: "2026-05-25 10:00:00"
                    }
                ]
            });

        renderWithProviders(<AdminDashboard/>);
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByText(byTextContent("Newer Job"))).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("岗位排序"), "oldest");

        let headings = screen.getAllByRole("heading", {level: 4}).map((element) => element.textContent);
        expect(headings[0]).toBe("Older Job");
        expect(headings[1]).toBe("Newer Job");

        await openApplicationsTab(user);
        await waitFor(() => expect(screen.getByLabelText("投递排序")).toBeInTheDocument());
        await user.selectOptions(screen.getByLabelText("投递排序"), "oldest");

        headings = screen.getAllByRole("heading", {level: 4}).map((element) => element.textContent);
        expect(headings[0]).toContain("求职者：bob");
        expect(headings[1]).toContain("求职者：alice");
    });
});
