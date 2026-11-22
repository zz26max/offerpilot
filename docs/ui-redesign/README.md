# OfferPilot UI 改版交付与验收

验收日期：2026-11-18（北京时间）；2026-11-22 完成复核修正、提交并合入 `main`。代码已实现，主代理已检查真实 diff、运行结果和浏览器截图。

本地预览：[登录](http://localhost:5173/)、[注册](http://localhost:5173/register)。认证后仍通过原来的工作台路由访问业务。

## 页面改版

| 页面 | 实际变化 | 保留的业务 |
| --- | --- | --- |
| 注册 | 按参考图做约 40:60 双栏；居中品牌文案、O 环标志、几何圆装饰；统一图标输入、独立密码显隐；手机上下排列 | 原注册 API、必填与邮箱校验、确认密码、后端错误、成功返回登录 |
| 登录 | 复用相同认证布局、输入框、按钮和品牌表达 | 邮箱密码认证、角色跳转、会话提示；Google 登录入口仅在配置凭据并显式开启时显示 |
| 岗位机会 | 浅青欢迎横幅、下划线图标页签、白底纵向岗位行；真实公司与完整描述、时间和状态分区；底部六状态图例 | 原 API 数据、投递/撤回/再次投递权限与结果同步；没有增加搜索、筛选、详情或分页 |
| 我的简历 | 浅青上传区、统一文件记录和解析状态、可读文本区与技能标签 | PDF/DOCX 与 5 MiB 限制、自动轮询、文本按需加载、规则覆盖率、下载和异常重试 |
| 岗位管理 | 统一紧凑记录、真实统计、筛选表单、状态与操作；手机单列 | 原编辑、关闭、开放、删除与前端筛选排序 |
| 发布/编辑岗位 | 统一表单层级、标签、文本域、主次按钮及焦点 | 原名称、公司、描述三个字段及验证/提交/取消逻辑 |
| 投递管理 | 统一分组、状态标签和状态保存区；手机纵排控件 | 原全量数据筛选、分组展开与状态更新 |
| 用户管理 | 统一姓名、邮箱、角色与账号状态；停用确认保持原流程 | 管理员只读、求职者启停、停用后会话失效 |

桌面工作区最大宽度 1600px；认证卡片最大约 1200px、高度至少 690px。390px 导航为品牌与用户同排、工作台入口第二排；后台四页签为 2×2。没有改变五条真实路由或页签结构。

## 公共组件与视觉变量

新增 `AuthBrand`（认证页品牌区）、`AuthInput`（图标输入与密码显隐）和 `Icon`（统一线性 SVG）；继续复用 Navbar、原简历组件与所有后台表单/列表。没有新增依赖，也没有替换 Bootstrap。

变量位于 `job-portal-frontend/src/index.css`，实际样式位于 `src/App.css`：

| 变量 | 值 / 用途 |
| --- | --- |
| `--action-primary` / `--action-primary-hover` | `#176b64` / `#105b55` |
| `--surface-page` / `--surface-primary` | `#f4f6f5` / `#ffffff` |
| `--text-primary` / `--text-secondary` | `#182220` / `#52605d` |
| `--border-subtle` / `--border-control` | `#dce3e1` / `#a6b4af` |
| `--status-success` / `--status-success-soft` | `#397247` / `#e9f4ec`：已投递、已录用、启用 |
| `--status-info` / `--status-info-soft` | `#255f8d` / `#e9f2f8`：筛选中、解析中 |
| `--status-danger` / `--status-danger-soft` | `#a33b36` / `#f9eae8`：未通过、解析失败 |
| `--status-neutral` / `--status-neutral-soft` | `#5d6966` / `#eef1f0`：未投递、撤回、禁用 |
| `--control-height` | 44px；认证表单为 48px |
| `--radius-control` / `--radius-panel` | 8px / 12px；认证大容器 20px |

可见焦点、hover、active、loading、disabled 和 reduced motion 均有对应样式。岗位描述保持完整内容，长文本允许换行；缺失的发布时间不制造日期或空标签。规则匹配明确为 23 个有限技术关键词覆盖率，不代表 AI 评估或招聘结论。

## 修改文件清单

以下路径均相对仓库根目录；用户原有 `README.zh-CN.md`、`.workbuddy/`、`docs/PROJECT-BRIEF.md`、`docs/resume-points.md` 改动保持原状。

| 文件 | 说明 |
| --- | --- |
| `job-portal-frontend/src/index.css` | 公共颜色、尺寸和圆角变量 |
| `job-portal-frontend/src/App.css` | 认证页、导航、岗位、简历、管理端与响应式样式 |
| `job-portal-frontend/src/components/AuthBrand.jsx` | 新增共享品牌区 |
| `job-portal-frontend/src/components/AuthInput.jsx` | 新增图标输入与密码显隐 |
| `job-portal-frontend/src/components/Icon.jsx` | 新增统一图标 |
| `job-portal-frontend/src/components/Register.jsx` | 注册布局和字段组件 |
| `job-portal-frontend/src/components/Login.jsx` | 登录统一视觉 |
| `job-portal-frontend/src/components/Navbar.jsx` | 角色入口和可键盘操作的用户菜单 |
| `job-portal-frontend/src/components/ApplicantDashboard.jsx` | 欢迎区、岗位行、刷新与提交互斥 |
| `job-portal-frontend/src/components/ResumePanel.jsx` | 上传区域统一图标 |
| `job-portal-frontend/src/components/ResumeMatches.jsx` | 明确规则覆盖率的真实边界 |
| `job-portal-frontend/src/components/AuthInput.test.jsx` | 新增密码显隐与输入值保留测试 |
| `job-portal-frontend/src/components/Navbar.test.jsx` | 菜单开闭、Escape、外部点击/焦点与退出 |
| `job-portal-frontend/src/components/ApplicantDashboard.test.jsx` | 延迟投递/撤回期间禁止刷新、之后恢复同步 |
| `job-portal-frontend/src/components/Login.test.jsx` | Google 失败提示、提交中禁用、移除演示账号提示 |
| `job-portal-frontend/src/components/AdminDashboard.test.jsx` | 后台页签键盘焦点与选中同步 |
| `job-portal-frontend/tests/e2e/helpers.js` | 精确字段定位，兼容密码显隐按钮 |
| `job-portal-frontend/tests/e2e/ui-redesign-live.spec.js` | 新增真实服务全流程测试 |
| `job-portal-frontend/tests/e2e/ui-redesign.spec.js` | 新增三尺寸真实页面截图及长文本/六状态边界测试 |
| `job-portal-frontend/tests/fixtures/verification-resume.pdf` | 无个人数据的合成 PDF 验证样本 |
| `job-portal-frontend/tests/fixtures/verification-resume.docx` | 同内容的合成 DOCX 验证样本 |
| `job-portal-frontend/DESIGN.md` | 同步已实施的设计规则 |
| `docs/ui-redesign/README.md` | 本交付记录 |
| `docs/ui-redesign/SCREENSHOTS.md` | 全部截图索引 |
| `docs/ui-redesign/screenshots/*.png` | 36 张真实浏览器截图 |
| `docs/ui-redesign/before-register-1440.png` | 改版前注册页对照 |

后台各组件没有重写业务，通过共享样式统一外观。后端、数据库结构、API 数据结构、认证实现、路由配置和依赖文件均未修改。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 前端单元/组件/集成测试 `npm test` | **16 个文件，106 项全部通过**（复核修正后） |
| `npm run lint` | 通过 |
| `npm run build` | 通过，137 个模块；产物 `index-C_ZaR9DF.css` / `index-DqhGPruS.js` |
| 非写库 UI 套件 `npx playwright test ui-redesign.spec.js --workers=1` | **4 项全部通过**（真实服务 + 三尺寸布局/六状态/长文本），并重新采集 32 张页面截图 |
| 完整浏览器套件 `npm run test:e2e -- --workers=1` | 上一轮 13 项通过；本轮未复跑，因为 `ui-redesign-live.spec.js` 会创建账号/岗位/简历并写入数据库 |
| 后端 `mvn -f job-portal-backend/pom.xml test -B -ntp` | 179 项：178 通过、0 失败、0 错误，1 项因 Windows 无符号链接权限由原测试自动中止 |
| Linux 补验 `LocalResumeStorageTest` | 3/3 全通过，0 跳过，包含上述符号链接安全用例 |
| `git diff --check` | 通过 |

没有删除测试、屏蔽失败断言或修改跳过配置。Windows 自动中止项通过 Linux 补验覆盖。

真实浏览器与 Spring Boot / MySQL / Redis / RabbitMQ 联调已验证：

- 注册密码确认、成功提示、邮箱密码登录，以及求职者和管理员进入正确工作台。
- 管理员发布、编辑、关闭、重新开放、删除岗位；已有投递时禁止删除。
- API 岗位加载、立即投递、撤回、再次投递；刷新后状态保持同步。
- PDF 和 DOCX 上传均返回 `QUEUED`，页面通过原 2 秒轮询自动进入 `SUCCEEDED`，没有靠手动刷新冒充轮询。
- 按需展开解析文本；23 关键词规则匹配；受控验证岗位的覆盖率为 100%。
- 下载两个原文件，并逐字节比对上传样本一致。
- 管理员修改筛选中、已录用、未通过，求职者对应操作均禁用。
- 停用确认的取消/确认、停用后旧会话失效和登录拒绝、重新启用后登录恢复、退出登录。

三尺寸布局检查覆盖八个页面/页签，检查页面横向溢出、可见表单控件至少 44px、单个激活面板、六种真实投递状态、长标题/公司/描述/邮箱、缺失时间和键盘焦点/页签切换。交付截图全部来自真实服务；长文本与六状态的 API 模拟仅存在于测试文件。

## 已完成、仅 UI 与验证边界

- **已完成并验证**：上述界面施工、共享组件、手机布局、用户菜单/密码显隐，以及新增刷新所需的提交互斥。新增刷新功能使用原有数据加载方法，并用同步在途守卫避免旧响应覆盖新投递状态。
- **本轮只改变 UI 的部分**：简历上传/解析/匹配/下载、后台 CRUD/筛选/用户启停及原认证。这些是既有业务，本轮复用并回归验证，不计为新开发的后端能力。
- **未做真实外部授权验证**：Google OAuth 第三方完整登录；原入口和回调逻辑保留，并由现有测试覆盖本地行为。
- **异常路径的验证方式**：失败解析、轮询中断、文本/匹配请求失败、文件过大及会话过期由组件/集成测试覆盖；真实消息链路验证成功解析。没有声称制造过真实消息故障。
- **设备边界**：使用真实 Chromium 浏览器的 390×844 视口验收，未声称在实体手机或其他浏览器完成验收。
- **截图差异**：当前数据库仅有一个开放岗位，因此真实列表没有参考图中的三条示例内容；未为截图写入虚构字段或在产品代码写死岗位。截图使用当前 Windows 字体渲染，系统字体平滑关闭会使字缘较参考图粗硬。
- **测试数据**：验证岗位及投递已通过原 API 清理；用户和简历没有删除 API，重复联调留下的合成验证账号均已停用，合成简历留在这些账号下。没有直接修改数据库或删除现有用户数据。管理端截图使用现有筛选，仅展示演示/合成记录，避免写入真实用户邮箱。
- **飞书同步**：用户已明确不再使用飞书，本地开发日记不纳入仓库。

## 审查结论

主代理已审查实际 diff、全部最终测试结果及桌面/手机/宽屏截图。先后修正了 Bootstrap 选择器覆盖手机导航、无真实时间仍显示空标签、重复样式、标题语义、刷新与提交竞态。产品代码验收通过，没有已知阻止本次 UI 交付的问题；飞书同步按用户最新要求跳过，上述未验证范围单独列出。

项目指定的旧版 `gpt-5.6-sol` 不在可用模型中，实施使用可用的 `gpt-6.1-sol`；主代理独立规划、检查 diff、复跑测试和作出交付判断。

## 2026-11-18 复核修正（第二轮）

独立复核（320–1920px 真实浏览器、长文本与六状态 route 构造、键盘/焦点/对比度测量）发现的问题已修复：

- 岗位卡长描述错位：`.applicant-job-record` 与 `.applicant-job-identity` 改为顶部对齐；440 字描述下图标、时间、操作列与标题同顶（1440/1000/800/700px 验证）。
- 控件边界对比度：`--border-control` 调整为 `#7c8b86`（对白底约 3.5:1），认证输入不再单独使用更浅的 `--border-strong`。
- 移动/平板注册首屏：900px 以下压缩品牌区与表单留白，600px 以下隐藏能力行；320/390/600/768/900px 下注册主按钮完整可见。
- 简历文件选择：保留真实 file input（视觉隐藏、可聚焦），由"选择简历文件"按钮触发并显示已选文件名；补齐焦点环与禁用态。
- 只读投递状态不再渲染同文案禁用按钮，仅保留状态胶囊与说明；移动端操作区改为单列。
- 后台页签补齐 roving tabindex 与 Arrow/Home/End 键盘导航；求职者简历页签的 `aria-controls` 目标始终存在（面板懒加载内容）。
- 状态色恢复可区分语义：已投递柔蓝、筛选中棕黄、已录用柔绿、未通过柔红、已撤回灰、未投递空心中性点。
- 登录页移除演示账号提示，补充 Google 登录失败提示与提交中禁用状态。
- 同步更新 `DESIGN.md`、单元测试（103→106）、两个 Playwright 规格与 32 张页面截图（`resume-details-*` 4 张保持上一轮真实解析实拍）。

本轮未改后端、数据库结构、API、路由或依赖；未复跑会写库的 `ui-redesign-live.spec.js`，其余验证见上表。
