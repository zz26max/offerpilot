# OfferPilot 全面代码审查报告（2026-10-26）

- 分支：`review/comprehensive-audit-2026-10-26`（自 `main` @ 9b35ff3）
- 范围：后端 `job-portal-backend`（Java 21 / Spring Boot 3.4）全部 main 源码、配置、迁移与 Docker 编排；前端 `job-portal-frontend`（React 19 / Vite 6）全部 src 源码与测试；前后端 API 契约逐条核对。
- 方法：四路并行专项审查（后端安全 / 后端正确性与性能 / 前端质量 / 接口一致性），所有高危与关键中危结论均由主审逐一回到源码复核行号与证据；复核通过后才收录。
- 结论速览：**应用层授权与数据隔离做得扎实，未发现 IDOR 与前后端契约不匹配；主要风险集中在部署与密钥层（高危 2 项）、两个后端高危缺陷（CPU DoS、解析持锁），以及前端横切关注点缺失（无统一 API 层）**。整体代码质量与测试投入高于同类项目平均水平。

## 基线验证结果

| 命令 | 结果 |
| --- | --- |
| `mvn -f job-portal-backend/pom.xml test`（Maven 3.9.11 / JDK 21，H2 自包含） | **179 个测试，0 失败，0 错误，1 跳过**（`LocalResumeStorageTest` 平台相关分支），BUILD SUCCESS |
| `npm run lint`（job-portal-frontend） | 通过，零告警 |
| `npm test`（Vitest） | **15 个文件，98 个测试全部通过** |

Playwright e2e 需完整服务栈，本轮未执行（不属于静态审查范围）。

---

## 一、高危（P0：立即处理）

### H-1 默认 JWT 密钥 + 自动创建弱口令管理员 = 演示部署完整接管
- 位置：`job-portal-backend/src/main/resources/application.yml:88`、`docker-compose.yml:81`、`config/DefaultLocalUsersInitializer.java:27-28`
- 证据：`jwt.secret: ${JWT_SECRET_KEY:MY_SECRET_KEY_123456789012345678901234567890}`；dev compose 默认 `SPRING_PROFILES_ACTIVE: local`（`docker-compose.yml:67`），该 profile 自动创建 `admin@local.test / admin123`（ADMIN 角色）。
- 影响：密钥是公开仓库中的已知值且长度满足 HS256 校验，应用可正常启动。任何按默认 compose 启动的环境（8080 发布到 0.0.0.0），攻击者可直接伪造 `admin@local.test` 的有效 JWT，`JwtAuthFilter` 从数据库加载到该真实账号且 enabled=true，即获得完整管理员权限。prod compose 已用 `:?` 强制注入密钥，风险仅在绕过 prod compose 的部署。
- 修复：删除默认值改为 `${JWT_SECRET_KEY:?JWT_SECRET_KEY is required}`；启动时校验密钥长度 ≥32 字节且非已知演示值。

### H-2 基础设施端口公网暴露，Redis 无口令（dev 与 prod 叠加均生效）
- 位置：`docker-compose.yml:11-12`（MySQL 3307）、`:16-22`（Redis 6379，无 `--requirepass`）、`:37-39`（RabbitMQ 5672 + 管理台 15672）
- 证据：`docker-compose.prod.yml` 未覆盖任何 `ports`；README 的生产运行方式正是两文件叠加，因此生产环境三件套基础设施全部对外发布。
- 影响：无口令 Redis 暴露可导致缓存投毒乃至 RCE；MySQL 与 RabbitMQ 管理台暴露暴力破解面。`OpenApiConfig.java:27` 硬编码的真实公网 EC2 地址表明这是公网部署模型，非纯本地假设。
- 修复：生产 compose 删除全部基础设施 `ports`（仅保留 backend/frontend）；Redis 增加 `--requirepass` 与 `REDIS_PASSWORD`；确需本机调试时绑定 `127.0.0.1:6379:6379`。

### H-3 技能匹配器 O(n²) 重叠判定 → 已登录用户 CPU DoS
- 位置：`service/TechnicalSkillMatcher.java:67-73`
- 证据：`boolean overlaps = acceptedAliases.stream().anyMatch(accepted -> candidate.overlaps(accepted));` —— 对每个候选线性扫描已接受列表。
- 影响：构造一份 10 万字符、全为不重叠短别名（如 "git git git…"，"git" 仅 3 字符可命中约 2.5 万次且互不重叠全部被接受）的简历并调用 `/api/resumes/{id}/matches`，比较次数约 3×10⁸，单请求可占用单核数秒；登录用户重复请求即可打满 Tomcat 线程池。正则本体已预编译，瓶颈仅在去重阶段。
- 修复：候选按 start 排序后改用扫描线/区间树合并（`TreeSet` 按端点二分只与相邻区间比较），降为 O(n log n)；同时对单文本命中别名总数设上限（如 2000）兜底。

### H-4 解析在悲观锁事务内做磁盘 IO + Tika CPU 提取
- 位置：`service/ResumeParseProcessor.java:47、69、79-82`
- 证据：`transactionTemplate.executeWithoutResult(status -> processWithLock(...))` → `findByIdForUpdate`（PESSIMISTIC_WRITE）→ 事务内 `textExtractor.extract(resumeStorage.load(...), ...)`。
- 影响：解析期间持有 `resumes` 行锁并占用一个 Hikari 连接（默认池 10）。当前单消费者只占 1 个连接，一旦调大 listener 并发（4-8），长事务会迅速耗尽连接池，所有 HTTP 接口排队。另外 `PROCESSING` 状态（:78 赋值）直到成功 save 前都不会单独提交，实际从不落库，锁窗口并非有意设计。
- 修复：拆为两段事务——短事务标记 PROCESSING 并提交，锁外做文件读取与 Tika 提取，第二段事务按状态条件写回 SUCCEEDED/失败计数。

### H-5 前后端部署契约硬编码（HTTPS 生产化的阻断点）
- 位置：`job-portal-frontend/src/config/backend.js:9`、`config/SecurityConfig.java:35`（`ALLOWED_ORIGINS` 默认 `http://localhost:5173`）、全仓库无 TLS 组件
- 证据：`export const BACKEND_API_URL = ... ? "http://localhost:8080" : \`http://${window.location.hostname}:8080\``；vite.config.js 无 dev proxy（前端直连后端、依赖 CORS 的架构）。
- 影响：生产一旦使用 HTTPS、反向代理或非 8080 端口，要么浏览器拦截 mixed-content、要么 CORS 全拒、要么前端打到不存在的地址。Basic 凭据与 JWT 目前全程 HTTP 明文公网传输。
- 修复：`BACKEND_API_URL` 支持 `import.meta.env.VITE_API_BASE_URL` 覆盖、生产默认同源相对路径；部署侧同步参数化 `ALLOWED_ORIGINS`/`FRONTEND_BASE_URL`（生产 `:?` 强制）并加 TLS 反向代理。

---

## 二、中危（P1：短期内处理）

### 后端安全

| # | 问题 | 位置 | 说明与修复 |
| --- | --- | --- | --- |
| S-1 | Swagger/API-docs 全环境公开 | `SecurityConfig.java:97`、`OpenApiConfig.java:27`、`application.yml:112-120` | 生产完整 API 面 + 认证方案 + 真实 EC2 地址公开，`try-it-out-enabled: true` 便于直接试探。prod profile 禁用 springdoc 或收紧 matcher；删除硬编码公网 URL |
| S-2 | 登录/注册无限流 | `LoginController.java:67-82`、全仓库无 bucket4j 等 | `/api/auth/login` 可无限暴力破解，`/register` 可批量灌号。引入 Redis 滑动窗口限流（IP+账号维度）+ 连续失败退避 |
| S-3 | OAuth JWT 走 URL fragment、24h 有效、无登出吊销 | `OidcLoginSuccessHandler.java:52-53`、`JwtUtil.java:29` | fragment 不进日志/Referer 但留在浏览器历史与同步；token 被盗只能等 24h 过期（禁用账号即时生效除外，`JwtAuthFilter.java:83` 每请求复查 DB 是亮点）。改为一次性授权码交换；缩短有效期 + refresh；登出 jti 黑名单。另：`FRONTEND_BASE_URL` 所有 compose 均未设置，生产会回退 localhost:5173 导致回跳失效 |
| S-4 | 注册接口可枚举账号 | `UserService.java:214-215、223-224` | 409 文案明确区分"邮箱已存在/用户名已存在"，登录侧已做通用文案，注册成为旁路。统一模糊文案或静默成功+邮件激活 |

### 后端正确性与性能

| # | 问题 | 位置 | 说明与修复 |
| --- | --- | --- | --- |
| C-1 | `applyForJob` 无事务，check-then-act 竞态 | `ApplicationService.java:57-77` | 并发双击投递撞 `uk_application_user_job` 唯一约束 → `DataIntegrityViolationException` 被映射为 500 而非 409；`:81` `resolveApplicantUser` 的 orElseGet(save) 同理。加 `@Transactional` + 捕获约束冲突转 409 |
| C-2 | 列表接口无分页 + EAGER 大字段/关联 | `ApplicationService.java:93-95`、`JobService.java:69-72`、`UserService.java:57-62`、`model/Resume.java:66-68` | admin 三个列表整表加载；`Application.user/job` 默认 EAGER（Hibernate 6 JOIN 一次拉全量，含 2000 字符描述与密码哈希）；简历列表接口把最长 100k 字符的 `extractedText` 无谓拉回内存（`ResumeService.listOwn` 不需要它）。`Pageable` + 投影 DTO + `@Basic(fetch=LAZY)` 或列表投影查询 |
| C-3 | Outbox 租约 < 发布最坏耗时 | `ResumeOutboxService.java:78-89`、`application.yml:97-99` | 单批 20 条 × confirm 超时 5s 最坏 100s ≫ 租约 30s；多实例时租约过期被重领、原实例的 markPublished 静默 no-op，造成放大重复投递（单实例默认不触发）。lease ≥ batch×timeout，或逐条领取，或循环续租 |
| C-4 | 消费重试 3.5s 内耗尽即永久失败 | `ResumeMessagingConfig.java:81-84`、`ResumeParseProcessor.java:102-106` | 瞬时故障（存储/DB 抖动）在 500ms+1s+2s 内耗尽 3 次尝试 → FAILED + DLQ，无跨消息延迟重投，一次抖动让简历永久解析失败。DLQ 消费侧加 TTL 重投；`parseAttempts` 仅在跨消息重试时递增 |
| C-5 | 缓存 evict 失败被 fail-open 吞掉 | `FailOpenCacheErrorHandler.java:36-39` | Redis 短暂不可用期间关岗/改岗的 evict 仅告警计数，恢复后旧值继续服务至 TTL 5 分钟：CLOSED 岗位在公开列表最多 5 分钟仍显示 OPEN，与投递校验（CLOSED 拒绝）不一致。evict 失败进补偿队列或命中时版本校验 |
| C-6 | jobs 缺 `(status, created_at)` 索引 | V1-V7 迁移、`JobRepository.java:21-23` | 公开端点缓存未命中与每次匹配请求全表扫描+filesort；数百条无感，数万条后每请求数十 ms。`CREATE INDEX idx_jobs_status_created ON jobs (status, created_at)` |

### 前端

| # | 问题 | 位置 | 说明与修复 |
| --- | --- | --- | --- |
| F-1 | 无统一 API 层：16 处手工 Bearer 头、无超时、错误提取器 3 套 | `AdminDashboard.jsx`×6、`ApplicantDashboard.jsx`×3、`ResumePanel.jsx:50`、`Login.jsx:39-55`、`ProtectedRoute.jsx:36-40`；`Login.jsx:11` / `AdminDashboard.jsx:99` / `auth/session.js:15` 三套错误文案提取 | 收益最大的重构：`axios.create({baseURL, timeout})` + 请求拦截器注 token + 响应拦截器统一 401 处理；所有请求无超时上限，后端挂起时按钮永久"正在保存" |
| F-2 | ProtectedRoute 任意错误即登出 | `ProtectedRoute.jsx:56-63` | hydration 时一次网络抖动/超时（非 401）也 `clearStoredSession` 踢回登录页且无提示。仅对明确认证失败清理会话，网络错误保留 token 允许重试 |
| F-3 | OAuth 回调链路缺陷（前端）+ OAuth 失败无提示（接口） | `OAuthLogin.jsx:27、40-46`；后端 `SecurityConfig.java:130-131` 重定向 `/?oauth_error=true` 而 `Login.jsx:29-31` 只读 `location.state`，`oauth_error` 全站无人读取 | (a) details 请求失败后 localStorage 残留无效 token；(b) 未复用统一会话超时/错误本地化；(c) OAuth 管理员也被送求职者看板（Login.jsx:68-77 有角色分发，此处没有）；(d) Google 登录失败用户落在登录页毫无提示。失败时清 token、按角色分发、Login 兼容读取 `oauth_error` 并展示提示 |
| F-4 | Admin 端加载三态缺失 | `AdminDashboard.jsx:207-229、620-624`、`AdminJobList.jsx:67-69` | 首次加载期间闪现"没有符合筛选条件"的误导空态；加载失败只有 alert 无重试按钮（求职者端有）；用户管理却区分"暂无/无匹配"两态，同类场景行为不一致 |
| F-5 | 重复逻辑成片 | 日期格式化 `Intl.DateTimeFormat("zh-CN")` ×4（`ApplicantDashboard.jsx:12`、`AdminApplicationsPanel.jsx:39`、`AdminJobList.jsx:4`、`resumePanelUtils.js:7`）；状态→CSS 类 ×4；状态中文文案 ×4（`messages.js:1`、`ApplicantDashboard.jsx:20-27`、`AdminDashboard.jsx:36-61`、`AdminUsersPanel.jsx:26`）；`formatApplicationTimestamp`/`shouldShowLastUpdated` 逐字重复 ×2 | 抽 `utils/datetime.js`、`statusMeta(status)`（统一返回 label+className）与 `StatusLegend` 组件；改一处生效全站 |
| F-6 | 表单校验与后端约束不一致 | `AdminJobForm.jsx:32-62` 仅 `required`，全项目无 `maxLength/minLength` | 后端 Title/Company≤255、Description≤2000、密码≥6；超限提交才收 400。加长度属性 + `form-text` 提示，前端先行拦截 |
| F-7 | Login 无防重复提交 | `Login.jsx:160-162` | 请求在飞可连点；`Register.jsx` 已有 `isSubmitting` 模式，对齐即可 |
| F-8 | "i18n"实为单语言映射层 | `messages.js` 全局无 locale 状态，UI 文案硬编码中文 ×3 处 | 若无多语言计划，收敛状态文案到一处并在 README 注明单语言；若有，补 locale 切换并把组件文案收进 messages |
| F-9 | 测试缺口：OAuthLogin 失败分支 | `OAuthLogin.test.jsx` 仅 2 用例 | details 失败分支（恰是 F-3 问题代码）、无效 token 残留、非 applicant 角色分发均无保护 |

### 接口一致性

逐条核对 5 个 controller 全部端点与前端每一处调用：**路径、方法、字段名、multipart part 名（`file`）、Bearer 约定、OAuth 回调（`/oauthlogon#token=`）、413 三层限额（前端 5 MiB 预检 = 后端业务校验 = Web 层 5MB 二进制）完全一致，无契约不匹配**。需处理项：

| # | 问题 | 说明 |
| --- | --- | --- |
| A-1 | 分页完全缺失（与 C-2 同源） | `/api/jobs`、`/api/applications`、`/api/users/admin` 全量返回，前端全量过滤排序；数据增长后不可扩展。加 `page/size/sort` 与过滤参数，过渡期对无参调用保持兼容 |
| A-2 | 冗余端点可收敛 | `GET /api/jobs/{id}`、`GET /api/applications/{id}`、`DELETE /api/applications/{id}`（仅 e2e 清理用）、`GET /api/users`、`GET /api/users/{id}` 前端均未调用 |
| A-3 | MSW mock 与真实 DTO 不同构 | `mswServer.js:7` 空壳；两个 integration 测试的"正常加载"mock 缺真实字段，后端改字段时测试不报警。以 `ResumePanel.test.jsx` 的同构 mock 为范本抽共享 fixtures |

---

## 三、低危（P2：择机处理）

### 后端
- **CLOSED 岗位详情公开可读**：`SecurityConfig.java:103` permitAll + `JobService.getJobById`（:81-85）不过滤状态，与列表只返回 OPEN 不一致 → 公开路径非 OPEN 返回 404。
- **密码策略弱**：`RegisterApplicantRequest.java:23` 仅 6 位无复杂度；配合 S-2 风险放大。
- **日志遗留**：`application.yml:65-72` 的 Hibernate 5 logger 类名在 Hibernate 6 下无效，但"修正"后即成口令哈希入日志风险；`database-platform: MySQL8Dialect` 已弃用。
- **容器以 root 运行**：`Dockerfile` 无 `USER`；OTel agent 运行期下载。加非 root 用户、构建期固化。
- **死代码（上膛状态）**：`UserService.updateUser` 未哈希密码直写（:94-104）、`getUserById` 裸 RuntimeException→500、controller catch-all 把 DB 故障误报 404。对应端点已 410，建议删除。
- **`deleteJob` 无事务 TOCTOU**：`JobService.java:149-157` 检查与删除间并发投递 → FK 异常 500 而非 409。
- **用户名唯一性仅应用层**：`UserService.java:210-217`，DB 无约束，并发可重名；email 并发撞唯一索引返回 500 而非 409。
- **JWT 每请求双次解析**：`JwtUtil.java:69-72、100-105` 各建 parser 各验签一次，skew 300s/60s 不一致；构建不可变 parser 复用 Claims。
- **无 Clock 注入**：全项目 `LocalDateTime.now()`，测试不可控、跨时区部署排序/租约漂移。
- **调度与消费调优**：`@Scheduled` 单线程最坏阻塞 100s；listener 未显式设 prefetch（默认 250）。
- **Outbox 表无清理**：PUBLISHED 行无限增长，需定时归档。
- **缓存穿透（轻）**：`job-by-id` 不缓存负结果且匿名可打，仅主键查询，量级有限。
- **孤儿文件无对账**：上传补偿盲区（进程崩溃/补偿删除失败）导致磁盘缓慢泄漏，需启动或定时对账。

### 前端
- `Navbar.jsx:16-25` 登出 `localStorage.clear()` 过度清理（应只删 token）；无服务端登出（JWT 无状态已知限制）。
- `Login.jsx:42` `window.btoa(email+":"+password)` 对非 Latin-1 密码抛异常。
- `Login.jsx:56、62、76` `console.log` 打印用户资料；未知角色时 token 已存却停在登录页无提示。
- 死资源/死依赖：`src/assets/react.svg`、`public/vite.svg` 无引用；`package.json` 的 `jsdom` 未使用；`test-results/.last-run.json` 测试产物入库。
- `App.jsx` 无 `*` 兜底路由，未知路径白屏。
- a11y：管理端 Tab 无键盘导航（求职者端有）；表单错误未用 `aria-invalid/aria-describedby` 关联。亮点：禁用弹窗焦点管理、`prefers-reduced-motion`、`aria-live` 均已做。
- `AdminDashboard.jsx` 827 行容器：所有 Tab 的服务端状态/mutation 上提，`AdminApplicationsPanel` 需收 14 个 props；派生数据（过滤/排序/计数）无 `useMemo`，O(jobs×applications) 每次渲染重算。按 Tab 拆容器。
- Redux 手写 reducer + 柯里化伪 action creator（`userActions.js:11-16`），已装 RTK 应换 `createSlice`。
- `ApplicantDashboard.jsx:437-445` 简历面板条件渲染，切 Tab 丢失展开态（岗位面板用 `hidden` 保留，行为不一致）。
- 列表加载无在飞守卫（`ResumePanel` 的 in-flight ref 模式是标杆，两个 Dashboard 未沿用）；`key={id ?? index}` 兜底掩盖数据异常。
- `main.jsx` 无 `<StrictMode>`。
- i18n pattern 缺 Resume 类两条（`Resume with id X was not found`、`Applicant account was not found` 落兜底文案）。
- 403/404 语义可探测（他人申请 403 vs 不存在 404，可枚举 id 存在性）；`User.password` 无 `@JsonIgnore`（当前 410 端点不返回实体，属潜伏风险）。

---

## 四、代码质量与结构评估

**后端**：分层清晰（controller/service/messaging/storage/repository），Resume 链路的 Outbox 实现（编程式事务规避自调用、publisher confirm 三分支、幂等消费、DLQ 路由）与文件上传防护（魔数校验、ZIP 炸弹上限、UUID 键 + 白名单正则 + normalize + startsWith 防穿越、原子 move）是同类项目较高水准。待改进：
1. 删除 `UserService` 死方法与 `JobService.createJob` 中无效的 `@CacheEvict(key="#result.id")`（新建 id 从未被缓存）。
2. 统一构造注入（JobService/UserService/LoginController/JwtUtil 仍是字段 `@Autowired`）。
3. Job/User 实体直接作 API 出入参（Application/Resume 已有 DTO），补 `JobResponse`/请求 DTO 并给 `User.password` 加 `@JsonIgnore`。
4. 五个实体重复的 `@PrePersist/@PreUpdate` 时间戳回调 → `@CreatedDate/@LastModifiedDate` + Auditing；`limit()` 在两处重复；`ensureNameAvailable/ensureEmailAvailable` 结构重复。
5. V1 Java 迁移"存在即跳过"逻辑可读性低，后续迁移建议纯 SQL。

**前端**：组件拆分方向正确（纯展示子组件已抽出），`ResumePanel` 是工程标杆（in-flight ref、mountedRef、blob URL 必然 revoke、文件名白名单清洗）。测试投入显著（Admin 30+ 用例、覆盖 401 会话流/防重复请求/轮询暂停恢复）。短板集中在横切关注点：**统一 API 层缺失**（F-1）是几乎所有前端中危问题的公共根因，应最先做；其次 Admin 容器拆分与公共模块抽取（F-5）。

**值得肯定**：IDOR 防护严密（简历/投递全走属主校验）；JWT 每请求复查 enabled 使禁号即时生效；错误响应无堆栈、结构三处同构；Actuator 收敛、CORS 白名单、bcrypt；缓存失效覆盖全部三个缓存名且 transactionAware；413 限额三层一致；e2e 覆盖核心管理/投递流程。

---

## 五、修复路线图

| 阶段 | 内容 | 预估工作量 |
| --- | --- | --- |
| P0（本周） | H-1 删默认密钥+启动校验；H-2 prod compose 收敛端口+Redis 口令；H-3 匹配器扫描线化+上限；H-4 解析拆两段事务；H-5 API 地址环境变量化 | 后端 2-3 天，前端 0.5 天 |
| P1（下个迭代） | S-1/S-2/S-3/S-4；C-1 事务+409；C-2 分页+投影（连带 A-1）；C-3/C-4/C-5/C-6；F-1 统一 API 层（连带 F-2/超时/错误提取）；F-3 OAuth 链路；F-4 加载三态；F-6/F-7 | 分 2-3 个 PR |
| P2（持续） | 低危清单按域批量清理；AdminDashboard 按 Tab 拆分；公共模块抽取（datetime/statusMeta/StatusLegend）；死代码死资源清理；A-3 共享 fixtures | 随功能迭代 |

> 记录说明：本报告为只读审查产物，未修改任何产品代码；所有行号对应 `main @ 9b35ff3`。测试基线（后端 179 通过 / 前端 98 通过 + lint 零告警）为后续修复提供回归基准。
