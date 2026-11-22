# OfferPilot 改版真实截图

全部图片由本地前端和真实后端运行结果产生。截图没有在产品中注入示例岗位。浏览器视口与文件名一致；手机同时提供完整页面长图，便于查看折叠线以下的操作。

> 2026-11-18 复核修正后，注册/登录/岗位机会/我的简历/后台四页签的 32 张页面截图已用同一非写库 UI 套件重新采集；`resume-details-*` 4 张仍为上一轮真实异步解析实拍（解析状态与匹配区未受本轮改动影响）。

| 页面 | 1440×900 | 390×844 | 1920×1080 | 手机完整页 |
| --- | --- | --- | --- | --- |
| 注册 | [查看](screenshots/register-1440x900.png) | [查看](screenshots/register-390x844.png) | [查看](screenshots/register-1920x1080.png) | [长图](screenshots/register-390-full.png) |
| 登录 | [查看](screenshots/login-1440x900.png) | [查看](screenshots/login-390x844.png) | [查看](screenshots/login-1920x1080.png) | [长图](screenshots/login-390-full.png) |
| 岗位机会 | [查看](screenshots/applicant-jobs-1440x900.png) | [查看](screenshots/applicant-jobs-390x844.png) | [查看](screenshots/applicant-jobs-1920x1080.png) | [长图](screenshots/applicant-jobs-390-full.png) |
| 我的简历 | [查看](screenshots/applicant-resumes-1440x900.png) | [查看](screenshots/applicant-resumes-390x844.png) | [查看](screenshots/applicant-resumes-1920x1080.png) | [长图](screenshots/applicant-resumes-390-full.png) |
| 岗位管理 | [查看](screenshots/admin-jobs-1440x900.png) | [查看](screenshots/admin-jobs-390x844.png) | [查看](screenshots/admin-jobs-1920x1080.png) | [长图](screenshots/admin-jobs-390-full.png) |
| 发布岗位 | [查看](screenshots/admin-publish-1440x900.png) | [查看](screenshots/admin-publish-390x844.png) | [查看](screenshots/admin-publish-1920x1080.png) | [长图](screenshots/admin-publish-390-full.png) |
| 投递管理 | [查看](screenshots/admin-applications-1440x900.png) | [查看](screenshots/admin-applications-390x844.png) | [查看](screenshots/admin-applications-1920x1080.png) | [长图](screenshots/admin-applications-390-full.png) |
| 用户管理 | [查看](screenshots/admin-users-1440x900.png) | [查看](screenshots/admin-users-390x844.png) | [查看](screenshots/admin-users-1920x1080.png) | [长图](screenshots/admin-users-390-full.png) |

真实异步解析完成、展开文本及规则匹配的补充截图（只有合成简历内容）：

- [1440×900 局部视口](screenshots/resume-details-1440x900.png)、[桌面完整页](screenshots/resume-details-1440-full.png)。
- [390×844 局部视口](screenshots/resume-details-390x844.png)、[手机完整页](screenshots/resume-details-390-full.png)。

[改版前注册页对照](before-register-1440.png)。

管理端截图使用已有搜索条件展示演示/合成记录；统计仍是 API 返回的真实全量计算。列表条数取决于数据库现状。所有测试结果、改动文件和验证限制见 [交付记录](README.md)。
