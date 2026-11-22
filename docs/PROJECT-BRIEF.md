# OfferPilot 项目技术档案（AI 可读版）

> **更新提示（2026-11-22）**：本文主体是 2026-10-18、提交 `9b35ff3` 的时点快照。此后新增了 2026-11 前端改版（认证/工作台/后台视觉与响应式）、若干安全与交互修正；最新测试数量为后端 179 用例、前端 106 用例。前端交付见 [`docs/ui-redesign/README.md`](./ui-redesign/README.md)，简历与面试口径见 [`docs/resume-points.md`](./resume-points.md)。

> **文档用途**：让 AI 助手或新成员在**不阅读源码**的前提下，完整、准确地理解本项目的定位、功能、架构、实现与成果归属。
> **信息截止**：2026-10-18，对应提交 `9b35ff3`（`main` 分支）。
> **事实来源**：仓库源码、`git log`、`docs/` 内文档、`docker-compose*.yml`、`pom.xml`、`package.json`。
> **写作原则**：只写可从仓库核实的事实；每条量化结论附口径；无法核实的内容不写。

---

## 0. 给 AI 的十句摘要

1. OfferPilot 是一个**求职者 + 招聘管理员双角色的全栈 Web 应用**，不是招聘网站爬虫，也不是 AI 招聘评估系统。
2. 后端 Java 21 / Spring Boot 3.4.4，前端 React 19 / Vite 6，数据层 MySQL 8 + Redis 7 + RabbitMQ 4.2。
3. 业务主线有两条：**岗位投递状态流转**（上游已有）与**简历上传 → 异步解析 → 规则技能匹配**（本地新增）。
4. 简历解析不在 HTTP 请求内完成：走 **Transactional Outbox → RabbitMQ → 消费者 → Apache Tika** 的异步链路。
5. Outbox 用「实例 ID + 30 秒租约 + 行锁」领取事件，以 **publisher confirm + mandatory return** 判定投递成功。
6. 消费端是**至少一次 + 行锁幂等**，失败累计 3 次进入死信队列（DLQ），不会无限重排。
7. 岗位读接口有 **Redis 三级缓存键**，缓存异常时 **fail-open** 回落数据库，并用 Micrometer 暴露命中/失败指标。
8. 唯一可引用的性能结论：**P95 从 122.78ms 降到 97.58ms（均值 −20.56%）**，Repository 回源 1,000 → 0；口径见 §9。
9. 项目是 **MIT 上游项目的二次开发**：上游快照 `559928f`，本地增量 `559928f..9b35ff3` 共 18 次提交、150 文件、+9,865/−2,258 行。
10. 归属分级见 §11：上游保留、二次创作（修改上游）、原创（新增模块）三类必须严格区分，负面清单在 §11.4。

---

## 1. 事实卡片

| 字段 | 值 |
| --- | --- |
| 产品名 | OfferPilot（中文界面）；代码内 artifactId `jobportal`，Java 包名 `net.jrodolfo.jobportal` |
| 应用形态 | 前后端分离 Web 应用；异步解析消费者与后端同进程部署 |
| 角色模型 | `APPLICANT`（求职者）、`ADMIN`（管理员），Spring 权限名为 `ROLE_APPLICANT` / `ROLE_ADMIN` |
| 代码版本 | `0.2.0`（`pom.xml` 与 `package.json` 一致；2026-10 的 UI 迭代未再升版本号） |
| 运行基线 | Java 21、Maven 3.9.11、Node.js 20（镜像）/ 24（CI） |
| 数据库 | MySQL 8.0，5 张业务表 + `flyway_schema_history` |
| 缓存 / 消息 | Redis 7.2（仅缓存）、RabbitMQ 4.2（仅简历解析） |
| 许可证 | MIT，保留上游版权声明（`LICENSE`、`UPSTREAM.md`） |
| 上游 | `github.com/jrodolfo/job-portal`，引入提交 `0d3e98b98e82bc9e6055e49566635be505e3f2fa` |
| 本地增量 | `559928f..9b35ff3`，18 commits，150 files，+9,865 / −2,258 |
| 默认端口 | 前端 5173、后端 8080、MySQL 3307→3306、Redis 6379、RabbitMQ 5672/15672、OTLP 4317/4318、Jaeger 16686 |
| 演示账号 | `user@local.test / user123`（求职者）、`admin@local.test / admin123`（管理员） |

---

## 2. 项目定位与整体用途

### 2.1 一句话定位

面向**求职者**与**招聘管理员**的双边求职管理平台：求职者浏览岗位、投递并跟踪状态、上传简历并获得「简历技能覆盖度」参考；管理员维护岗位、审核投递、启停求职者账号。

### 2.2 解决的问题

| 问题 | 具体表现 | 本项目做法 |
| --- | --- | --- |
| 投递状态不可见 | 求职者投递后无法得知进度，重复投递同一岗位 | 岗位卡片直接显示投递状态与时间；`(user_id, job_id)` 唯一约束 + `WITHDRAWN → APPLIED` 幂等再投 |
| 简历信息无法被系统利用 | 上传的 PDF/DOCX 是二进制黑盒，无法检索或比较 | 异步解析为纯文本（上限 10 万字符），再与开放岗位做可解释的技能覆盖度比较 |
| 上传解析阻塞请求 | 大文件解析耗时长，同步处理会拖垮接口 | HTTP 只负责安全落盘与入队，解析由独立消费者完成 |
| 缓存引入新故障点 | Redis 故障会导致原本可用的查询一起失败 | fail-open：缓存异常只降级不回滚，业务回落数据库 |
| 双写不一致 | 「文件已落盘 / 数据库已提交」与「消息已发送」无法原子完成 | Transactional Outbox + 补偿删除 + 消费端幂等 |

### 2.3 目标用户与使用场景

- **求职者**：注册/登录 → 浏览开放岗位 → 投递/撤回/再投 → 查看投递状态 → 上传简历 → 查看解析文本 → 查看与开放岗位的技能匹配。
- **管理员**：登录 → 发布/编辑/关闭/重开/删除岗位 → 按状态分组审核投递 → 启用/停用求职者账号。
- **开发者/运维**：`docker compose up -d --build` 一键起全栈；通过 Swagger、Actuator/Prometheus、Jaeger 观察与调试。

### 2.4 明确的非目标（Non-goals）

以下内容**不在**当前实现范围内，文档与对外表述不得暗示具备：

- 不是 AI / 语义匹配：匹配是**有限词典的规则覆盖率**，不涉及向量、模型或语义理解。
- 不是招聘决策系统：不输出录用概率、不评价候选人能力、不做简历打分排名。
- 不是高可用分布式系统：文件存储为单实例本地磁盘，缓存统计为单进程本地统计。
- 不是多租户 SaaS：无组织/租户隔离，无计费、无审计日志。
- 不支持简历删除、批量导入、邮件通知、站内消息。

### 2.5 与上游的关系

| 维度 | 说明 |
| --- | --- |
| 引入方式 | 通过 GitHub codeload 归档建立本地基线（当时 Git 传输持续重置），原仓库配置为 `upstream` remote |
| 基线提交 | `559928f chore: import upstream snapshot 0d3e98b` |
| 历史关系 | 本地历史与 `upstream/main` **无共同祖先**，不能用常规 ahead/behind 比较 |
| 开发原则 | 只把实际新增、重构、验证过的内容作为二次开发成果；上游功能不作为原创声称（`UPSTREAM.md` 明文规定） |
| 许可义务 | 分发时保留 MIT 许可证与原作者版权声明 |

---

## 3. 领域模型

### 3.1 实体与关系

```
User 1 ──< Application >── 1 Job
  │
  └──< Resume 1 ──< ResumeOutboxEvent
```

| 实体 / 表 | 关键字段 | 约束与说明 |
| --- | --- | --- |
| `User` / `users` | id, name, email, password(可空), auth_provider, role, enabled, created_at, updated_at | `email` 唯一；`password` 为 BCrypt 哈希，OAuth 用户为 `NULL`；`enabled=false` 立即阻止新请求（每次请求从库重载） |
| `Job` / `jobs` | id, title, description(≤2000), company, posted_date, status, created_at, updated_at | `status ∈ {OPEN, CLOSED}`，创建默认 `OPEN` |
| `Application` / `applications` | id, user_id, job_id, status, created_at, updated_at | 唯一约束 `uk_application_user_job(user_id, job_id)`；撤回不删行，保留历史 |
| `Resume` / `resumes` | id, user_id, original_filename, storage_key, content_type, size_bytes, sha256, parse_status, parse_attempts, extracted_text, error_code, error_summary, parsed_at, timestamps | `storage_key` 唯一（UUID + 扩展名）；`extracted_text` MySQL 为 `LONGTEXT`，H2 测试为 `LONGVARCHAR` |
| `ResumeOutboxEvent` / `resume_outbox` | id, event_id, resume_id, event_type, schema_version, status, attempt_count, available_at, locked_until, locked_by, created_at, published_at, last_error | `event_id` 唯一；索引 `(status, available_at, id)` 支撑扫描 |

### 3.2 状态机（区分「代码强制」与「仅约定」）

**岗位 Job**

| 迁移 | 触发 | 是否强制 |
| --- | --- | --- |
| （创建）→ `OPEN` | `POST /api/jobs`，服务端强制赋值 | 强制 |
| `OPEN → CLOSED` / `CLOSED → OPEN` | `PUT /api/jobs/{id}/status?status=` | 只校验目标值合法，不校验迁移方向 |
| 删除 | `DELETE /api/jobs/{id}` | 有投递记录时返回 `409`，禁止硬删 |

**投递 Application**

| 迁移 | 触发 | 是否强制 |
| --- | --- | --- |
| （创建）→ `APPLIED` | `POST /api/applications/{jobId}` | 强制 |
| 任意状态 → `WITHDRAWN` | 求职者 `PUT ...?status=WITHDRAWN` | 强制：求职者**只能**设为 `WITHDRAWN`（未校验来源状态，`ACCEPTED` 也可被撤回） |
| `WITHDRAWN → APPLIED` | 再次 `POST` 同一 jobId | 强制：复用原行，不新建 |
| 任意 → `REVIEWING / ACCEPTED / REJECTED` | 管理员 `PUT ...?status=` | 只校验目标值属于枚举，**不校验状态机方向**（管理端可任意跳转） |
| 删除 | `DELETE /api/applications/{id}` | 管理员或本人 |

> 注意：不存在「非法迁移」的服务端拒绝逻辑（除角色限制外），因此不要把它描述为严格状态机。

**简历解析 Resume**

| 状态 | 含义 | 进入条件 |
| --- | --- | --- |
| `UPLOADED` | 历史上传但未入队（只可能出现在旧数据） | 实体默认值 |
| `QUEUED` | 已入队待处理 | 上传事务内写入；或失败后未达上限时回退 |
| `PROCESSING` | 消费者已取到行并开始提取 | 消费者持行锁后设置 |
| `SUCCEEDED` | 提取成功，`extracted_text` 有值 | Tika 返回非空文本 |
| `FAILED` | 终态失败 | `parse_attempts >= 3` |

**发件箱 Outbox**

| 状态 | 含义 |
| --- | --- |
| `PENDING` | 待发布；`available_at` 早于当前时间才可领取 |
| `IN_PROGRESS` | 已被某实例领取，`locked_until` 到期后可被重新领取 |
| `PUBLISHED` | 收到 publisher confirm 且未被退回；同时清空 `locked_by/locked_until` |

---

## 4. 功能清单与业务流程

### 4.1 求职者能力

| 能力 | 说明 |
| --- | --- |
| 注册 / 登录 | 邮箱密码注册（`POST /api/auth/register`）；登录换取 JWT；可选 Google OAuth2 |
| 浏览岗位 | 只看 `OPEN`；公开接口，无需登录 |
| 投递 | 对开放岗位投递；重复投递返回 `409`；已撤回可再投 |
| 撤回 | 只能把自己的投递改为 `WITHDRAWN` |
| 我的简历 | 上传 PDF/DOCX（≤5 MiB）、查看解析状态与文本、下载原文件、查看与开放岗位的匹配 |
| 会话处理 | 任一请求返回 `401` 时清除本地令牌并跳回登录页，携带失效提示 |

### 4.2 管理员能力

| 能力 | 说明 |
| --- | --- |
| 岗位管理 | 创建、编辑、关闭、重开、删除（有投递则拒绝） |
| 投递审核 | 查看全部投递，按岗位分组、按状态筛选，更新为 `REVIEWING/ACCEPTED/REJECTED` |
| 用户管理 | 只列出用户、启用/停用**求职者**；管理员账号只读 |
| 遗留端点 | `POST/PUT/DELETE /api/users/**` 一律返回 `410 Gone`，防止绕过注册流程或硬删用户 |

### 4.3 流程 A：登录与请求鉴权

1. 前端 `POST /api/auth/login`，携带 `Authorization: Basic base64(email:password)`。
2. 后端用 `DelegatingPasswordEncoder` 校验密码，签发 HS256 JWT（`sub=email`，有效期 24 小时）。
3. 前端把 token 存入 `localStorage`，后续请求带 `Authorization: Bearer <token>`。
4. 每个请求经 `JwtAuthFilter`：验签 → 取 `sub` → **从数据库重载用户** → 校验 `enabled` → 写入 `SecurityContext`。
5. 令牌无效/账号被停用 → 不建立认证 → 受保护接口返回 `401`（统一 JSON，不返回登录页 HTML）。

> 关键设计：`enabled` 不是签发时快照，而是每请求重载，因此**停用账号可立即生效**，无需等 JWT 过期。

### 4.4 流程 B：投递 / 撤回 / 再投

1. `GET /api/jobs` 取开放岗位（走缓存）。
2. `POST /api/applications/{jobId}`：
   - 岗位不存在 → `404`；岗位 `CLOSED` → `409`；
   - 已存在记录且状态为 `WITHDRAWN` → **复用该行**改回 `APPLIED`（保留原 id 与创建时间）；
   - 已存在其他状态 → `409`。
3. 并发重复提交由数据库唯一约束 `(user_id, job_id)` 兜底。
4. 撤回：`PUT /api/applications/{id}?status=WITHDRAWN`，仅本人或管理员。
5. 管理员改状态：同一端点，**可设为任意枚举值**（前端界面只提供 `REVIEWING/ACCEPTED/REJECTED`）。

> 兼容逻辑：`applyForJob` 在用户不存在时会自动补建 `LOCAL/APPLICANT` 用户（上游遗留行为，正常流程不会触发）。

### 4.5 流程 C：简历上传 → 异步解析 → 技能匹配（核心链路）

**阶段 1：HTTP 上传（同步，毫秒级）**

1. `POST /api/resumes`，`multipart/form-data`，字段名 `file`。
2. 校验：非空、`≤5 MiB`（Web 层 `max-file-size=5MB`/`max-request-size=6MB`，业务层再校验一次）。
3. 读入字节数组 → 结构校验（详见 §7.5）→ 文件名净化 → 落盘（`.tmp` + `ATOMIC_MOVE`）→ 计算 SHA-256。
4. **同一数据库事务**内写入 `Resume(parse_status=QUEUED)` 与 `ResumeOutboxEvent(PENDING)`。
5. 事务失败 → 反向删除刚落盘的文件；清理异常挂到原异常 `suppressed`，不掩盖根因。
6. 返回 `201` + 简历元数据（`id`、状态 `QUEUED`）。

**阶段 2：Outbox 发布（后台调度，默认每 1s）**

1. `claimBatch`：在事务内以 `PESSIMISTIC_WRITE` 查询 `PENDING 且 available_at ≤ now` 或 `IN_PROGRESS 且 locked_until ≤ now` 的事件，按 id 升序取前 20 条。
2. 批量置为 `IN_PROGRESS`，写入 `locked_by=<实例 UUID>`、`locked_until=now+30s` 并 flush。
3. 逐条发送到 RabbitMQ，等待 publisher confirm（5s 超时）；`mandatory=true` 时未被路由的消息会被退回。
4. `CONFIRMED` → 置 `PUBLISHED`；否则 → `attempt_count+1`、`available_at=now+min(initial×2^(n-1), max)`（1s 起、1m 封顶）、状态回 `PENDING`，并记录 `last_error` 安全错误码。
5. 发送抛异常 → 同样按失败处理，错误码 `BROKER_UNAVAILABLE`。

**阶段 3：消费与解析（至少一次）**

1. `@RabbitListener` 消费 `offerpilot.resume.parse.v1`，JSON 反序列化为 `ResumeParseMessage{resumeId, eventId, eventType, schemaVersion}`。
2. 校验消息结构：`eventType == RESUME_PARSE_REQUESTED` 且 `schemaVersion == 1`，否则抛不可重试异常。
3. 事务内 `findByIdForUpdate(resumeId)` 锁定简历行：
   - 行不存在 → `StaleResumeMessageException`（不可重试）；
   - 已 `SUCCEEDED` → 直接返回（**幂等：重复消息不再解析**）；
   - 已 `FAILED` → `TerminalResumeMessageException`（不可重试）；
   - 否则置 `PROCESSING` → 从存储读取 → Tika 提取 → 非空则置 `SUCCEEDED` 并保存文本。
4. 失败处理（独立事务 `recordFailure`）：`parse_attempts+1`；`< 3` 回 `QUEUED`，`>= 3` 置 `FAILED`，写入安全 `error_code` 与 `error_summary`（≤255）。
5. 异常继续向上抛，由 `RetryInterceptor` 按 500ms 起、×2、上限 5s 退避重试；重试耗尽由 `RejectAndDontRequeueRecoverer` 拒绝且不重回队列 → 经 DLX 进入死信队列。

**阶段 4：展示与匹配（按需）**

1. 列表接口只返回元数据，**不返回** `extracted_text`、`storage_key`、服务器路径。
2. 前端仅当存在 `QUEUED/PROCESSING` 记录时，每 2 秒静默轮询列表；静默失败即暂停轮询并提示手动刷新。
3. 用户展开一条 `SUCCEEDED` 记录时，才请求 `GET /api/resumes/{id}` 取解析文本；再点「查看岗位匹配」才请求 `matches`。
4. 匹配计算见 §7.7，结果不落库。

### 4.6 接口清单（27 个业务端点 + 3 个基础设施端点）

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | 需 Basic 认证 | 换取 JWT |
| POST | `/api/auth/register` | 公开 | 注册求职者，`201` |
| GET | `/api/auth/details` | 已认证 | 返回 `username` / `displayName` / `roles` |
| GET | `/api/jobs` | 公开 | 仅 `OPEN`，走缓存 |
| GET | `/api/jobs/admin` | ADMIN | 全部状态，走缓存 |
| GET | `/api/jobs/{id}` | 公开 | 详情，走缓存 |
| POST | `/api/jobs` | ADMIN | 创建，强制 `OPEN` |
| PUT | `/api/jobs/{id}` | ADMIN | 编辑标题/描述/公司/发布日期 |
| PUT | `/api/jobs/{id}/status` | ADMIN | `?status=OPEN` 或 `?status=CLOSED` |
| DELETE | `/api/jobs/{id}` | ADMIN | 有投递 → `409` |
| POST | `/api/applications/{jobId}` | APPLICANT | 投递/再投，`201` |
| GET | `/api/applications` | APPLICANT / ADMIN | 本人 / 全部 |
| GET | `/api/applications/{id}` | APPLICANT / ADMIN | 非本人 → `403` |
| PUT | `/api/applications/{id}` | APPLICANT / ADMIN | `?status=`；求职者仅 `WITHDRAWN` |
| DELETE | `/api/applications/{id}` | APPLICANT / ADMIN | `204` |
| POST | `/api/resumes` | APPLICANT | 上传，`201` |
| GET | `/api/resumes` | APPLICANT | 本人列表（按创建时间、id 倒序） |
| GET | `/api/resumes/{id}` | APPLICANT | 本人详情；他人/不存在均 `404` |
| GET | `/api/resumes/{id}/matches` | APPLICANT | 规则匹配；未解析完成 `409` |
| GET | `/api/resumes/{id}/content` | APPLICANT | 下载原文件 |
| GET | `/api/users`、`/api/users/admin` | ADMIN | 用户列表（无密码字段） |
| GET | `/api/users/{id}` | ADMIN | 单个用户（无密码字段） |
| PUT | `/api/users/admin/applicants/{id}/enabled` | ADMIN | 启停求职者；管理员账号 → `403` |
| POST / PUT / DELETE | `/api/users`、`/api/users/{id}` | ADMIN | **遗留端点，固定 `410 Gone`** |
| GET | `/actuator/health` | 公开 | 健康检查 |
| GET | `/actuator/prometheus` | ADMIN | 指标 |
| GET | `/v3/api-docs`、`/swagger-ui.html` | 公开 | OpenAPI |

---

## 5. 架构设计

### 5.1 逻辑分层（后端）

```
controller   暴露 REST，做角色/归属校验，不写业务规则
   ↓
service      业务事务边界、生命周期规则、匹配计算
   ↓
repository   Spring Data JPA；仅在此层出现 JPQL / 锁
   ↓
model        JPA 实体（User / Job / Application / Resume / ResumeOutboxEvent）
```

横切模块：`config`（安全、缓存、消息、OpenAPI）、`messaging`（Outbox 发布与消费）、`storage`（文件存储接口 + 本地实现）、`observability`（缓存指标）、`dto`（响应投影）、`exception`（统一错误契约）、`util`（JWT）。

### 5.2 运行时拓扑（Docker Compose，7 个服务）

```
浏览器
  │  HTTP
  ▼
frontend (node:20 + serve, :5173)
  │  /api 直连
  ▼
backend (Spring Boot, :8080) ──▶ MySQL 8 (:3306)
  │        │                      
  │        ├──▶ Redis 7 (:6379)      岗位查询缓存
  │        ├──▶ RabbitMQ 4.2 (:5672) 简历解析队列
  │        └──▶ OTel Collector (:4317/:4318) ──▶ Jaeger (:16686)
  └── 本地卷 resume-data 挂载 /app/data/resumes
```

### 5.3 关键边界

| 边界 | 位置 | 作用 |
| --- | --- | --- |
| 安全边界 | 后端 `SecurityConfig` + `JwtAuthFilter` | 前端不承担授权判断；路由守卫只改善体验 |
| 事务边界 | `ResumeUploadPersistence`、`ResumeParseProcessor`、`ResumeOutboxService` | 显式 `TransactionTemplate` 控制提交时机：失败计数必须在异常抛出前独立提交 |
| 异步边界 | `ResumeOutboxPublisher` + `ResumeParseListener` | HTTP 与解析解耦；失败可重试、可观测 |
| 存储边界 | `ResumeStorage` 接口 | 当前 `LocalResumeStorage`，可替换为 MinIO 等对象存储 |
| 缓存边界 | `CacheConfig` + `FailOpenCacheErrorHandler` | 缓存故障降级为数据库直读 |

### 5.4 部署形态

| 形态 | 入口 | 特征 |
| --- | --- | --- |
| 本地全栈 | `docker compose up -d --build` | 7 服务；OTel 采样率 1.0；Jaeger 可查 |
| 生产覆盖 | `docker-compose.prod.yml` | 用 `:?` 强制必填密钥；采样率 0.1；Jaeger 仅在 `local-only` profile |
| 镜像发布 | `docker-bake.hcl` | `linux/amd64` + `linux/arm64` 双架构 |
| CI | `.github/workflows/backend-docker-build.yml` | push main：后端测试 → 前端测试 → 打包 → 构建双镜像 → 有凭据才推送 |

---

## 6. 技术栈

| 层 | 技术 | 版本 | 用途 | 来源 |
| --- | --- | --- | --- | --- |
| 语言/运行时 | Java | 21 | 后端 | 上游 |
| 框架 | Spring Boot | 3.4.4 | Web / 自动配置 | 上游 |
| 安全 | Spring Security + JJWT | 6.x / 0.11.5 | Basic 认证、JWT 签发校验、OAuth2/OIDC | 上游，**本地重构** |
| 持久化 | Spring Data JPA + Hibernate | 6.x | ORM、行锁 | 上游 |
| 迁移 | Flyway（core + mysql） | 随 Boot 管理 | 版本化 schema | 上游引入，**本地新增 V5–V7** |
| 数据库 | MySQL | 8.0 | 主存储 | 上游 |
| 缓存 | Redis + Spring Cache | 7.2 | 岗位查询缓存 | **本地新增** |
| 消息 | RabbitMQ + Spring AMQP | 4.2 | 简历解析队列 | **本地新增** |
| 文本提取 | Apache Tika | 3.3.2 | PDF/DOCX → 纯文本 | **本地新增** |
| 指标 | Micrometer + Prometheus registry | 随 Boot 管理 | 自定义缓存指标 | **本地新增** |
| 追踪 | OpenTelemetry Java Agent + Collector + Jaeger | agent 2.11.0 / collector 0.120.0 | 链路追踪 | 上游接入，**本地调整采样与配置** |
| API 文档 | springdoc-openapi | 2.8.4 | Swagger UI | 上游 |
| 前端框架 | React | 19.1 | SPA | 上游 |
| 构建 | Vite | 6.3 | 开发/打包（`outDir=build`） | 上游 |
| 状态管理 | Redux Toolkit + react-redux | 2.11 / 9.2 | 用户会话状态 | 上游 |
| 路由 | React Router | 7.6 | 路由与守卫 | 上游 |
| HTTP 客户端 | Axios | 1.9 | 请求封装 | 上游 |
| 样式 | Bootstrap + 自定义 CSS | 5.3 | 基础样式 + 设计系统 | 上游，**本地重写** |
| 后端测试 | JUnit 5、Spring Boot Test、H2（`MODE=MySQL`）、Mockito | — | 单测/集成测试（Testcontainers 依赖已声明但当前未使用） | 上游引入，**本地新增用例** |
| 前端测试 | Vitest、Testing Library、MSW、happy-dom | — | 组件/集成测试 | 上游引入，**本地新增用例** |
| E2E | Playwright | 1.60 | 浏览器流程测试 | 上游引入，**本地新增用例** |
| 容器 | Docker Compose、Buildx/Bake | — | 本地与生产运行 | 上游 |

---

## 7. 关键实现机制

### 7.1 认证与授权

- **两种入口，一种凭证**：邮箱密码（`DelegatingPasswordEncoder`，BCrypt）与 Google OIDC 都只用于「证明身份」；对外 API 一律只认**本应用签发的 HS256 JWT**。
- **OIDC 收敛**：本地删除了上游 `OAuthController`（会把 Google ID Token 原样回传前端、并提供用 client secret 换 token 的端点）。改为 `OidcLoginSuccessHandler`：校验 `email_verified=true` → 建/更新用户 → 签发应用 JWT → 以 URL **fragment** 回跳 `/oauthlogon#token=...`（fragment 不随请求发送，也不进 Referer）。
- **防账号劫持**：Google 身份只允许创建或更新「`authProvider=GOOGLE` 且 `role=APPLICANT` 且 `enabled=true`」的账号；若同邮箱已存在本地密码账号、管理员账号或被停用账号，直接拒绝登录，**不做隐式绑定**，避免用 OAuth 接管高权限账号。
- **令牌校验**：`JwtUtil` 只接受本应用密钥签名的 token，`sub` 为邮箱，`exp` 24 小时；解析阶段允许 300 秒时钟偏移，`validateToken` 允许 60 秒。
- **过滤器链**：`JwtAuthFilter` 位于 `UsernamePasswordAuthenticationFilter` 之前；每次请求从数据库重载用户，`enabled=false` 时直接不认证。
- **授权规则**：`SecurityConfig` 精确到 HTTP 方法；`/api/users/**` 仅 ADMIN，`/api/resumes/**` 仅 APPLICANT，公开读取仅限岗位列表与详情；`/api/**` 的 401/403 使用自定义 Handler 返回统一 JSON。
- **归属校验在服务层**：简历查询一律 `findByIdAndUser_EmailIgnoreCase`，他人资源与不存在同样返回 `404`，避免枚举探测。

### 7.2 缓存与 fail-open

| 项 | 值 |
| --- | --- |
| 缓存名 | `jobs-open`、`jobs-all`、`job-by-id` |
| Key | 列表用固定 key `'all'`；详情用岗位 id |
| Key 前缀 | `offerpilot::` |
| TTL | 5 分钟（`CACHE_TTL`） |
| 写入时机 | `transactionAware()`：缓存写/失效延迟到事务提交后，避免读到未提交数据 |
| 失效策略 | 任何岗位写操作 `@Caching(evict)`：两个列表 `allEntries=true`，详情按 `#id`；创建时按 `#result.id` |
| 故障策略 | `FailOpenCacheErrorHandler` 捕获 get/put/evict/clear 异常，只记 WARN + 计数，业务继续读库 |
| 连接超时 | 连接 500ms、命令 500ms（快速失败，避免缓存拖慢请求） |
| 序列化 | 默认 JDK 序列化（`Job implements Serializable`，显式 `serialVersionUID`） |

**指标**（仅有限枚举标签，禁止把 key / 用户信息做成 tag）：

| 指标 | 标签 | 含义 |
| --- | --- | --- |
| `offerpilot_cache_requests_total` | `cache`、`result`（`hit` / `miss`） | 单进程自启动累计的命中/未命中 |
| `offerpilot_cache_fail_open_errors_total` | `cache`、`operation`（`read` / `write` / `eviction` / `clear`） | 被 fail-open 吞掉的缓存异常 |
| `offerpilot_job_repository_loads_total` | `query=open-jobs` | `getOpenJobs` 方法体实际执行次数（非任意 SQL 数） |

### 7.3 Outbox 投递（可靠性核心）

- **为什么需要**：文件落盘、数据库提交、消息发送是三个无法原子化的副作用。只发消息不写库会丢数据，只写库不发消息会永远不解析。
- **做法**：把「要发什么消息」当成数据，与业务数据同事务落库；再由后台任务把「数据」翻译成「消息」。
- **领取并发控制**：`findClaimable` 使用 `PESSIMISTIC_WRITE`（`SELECT ... FOR UPDATE`），多实例串行领取；`locked_by` 记录实例 UUID，后续 `markPublished/markFailedAttempt` 都要求 `eventId + lockedBy` 同时匹配，防止 A 实例覆盖 B 实例的结果。
- **投递判定**：`RabbitTemplate` 开启 `publisher-confirm-type=correlated` 与 `mandatory=true`；只有 `CONFIRMED` 且未收到 return 才算成功。
- **失败退避**：`min(initial × 2^(attempt-1), max)`，默认 1s → 1m；位移上限 30，避免溢出。
- **已知窗口**：可能「消息已送达但 PUBLISHED 未写回」，租约到期后会重复投递 —— 由消费端幂等承接。

### 7.4 消费端幂等与终态

- 消息带 `eventType` 与 `schemaVersion`，不匹配即视为陈旧消息，直接抛不可重试异常，不浪费重试次数。
- 行锁 + 状态判断构成幂等：`SUCCEEDED` 直接返回；`FAILED` 直接拒绝；只有 `QUEUED/PROCESSING` 会真正解析。
- 重试策略：`SimpleRetryPolicy(3)`，`StaleResumeMessageException` 与 `TerminalResumeMessageException` 标记为**不可重试**；`ExponentialBackOffPolicy` 500ms → 5s，倍数 2。
- 耗尽后 `RejectAndDontRequeueRecoverer`：不重回队列，经 `offerpilot.resume.parse.dlx` 进入 `offerpilot.resume.parse.failed.v1`。
- 队列、交换机、消息均持久化（`durable`），Broker 重启不丢未消费消息。

### 7.5 文件校验与存储

| 检查 | 实现 | 目的 |
| --- | --- | --- |
| PDF 类型 | 首字节 `%PDF-` | 不依赖扩展名/Content-Type |
| DOCX 类型 | 以 `PK` 开头，且 ZIP 内含 `[Content_Types].xml` 与 `word/document.xml` | 区分「真 DOCX」与普通 ZIP |
| ZIP 炸弹 | 解压扫描总量 ≤64 MiB、条目数 ≤2,048 | 限制解压放大 |
| 大小 | 业务层 5 MiB + Web 层 `max-file-size` / `max-request-size` | 双层防线 |
| 文件名 | 去路径分隔符、去控制字符、截断 255、空则回退 | 防目录穿越与响应头注入 |
| 存储键 | UUID + 允许扩展名白名单 + 正则校验 + `normalize().startsWith(root)` | 防路径穿越 |
| 落盘原子性 | 先写 `<uuid>.tmp`，再 `ATOMIC_MOVE`（不支持则普通 move） | 不产生半成品可读文件 |
| 内容指纹 | SHA-256 存库 | 便于校验与去重扩展 |

### 7.6 文本提取

- 按**库中已校验的规范 MIME** 选择解析器：PDF → `PDFParser`，DOCX → `OOXMLParser`；其他类型直接报 `UNSUPPORTED_TYPE`。
- PDF 关闭 OCR（`OCR_STRATEGY.NO_OCR`），避免扫描件触发昂贵识别。
- 嵌入附件不递归（自定义 `EmbeddedDocumentExtractor`，`shouldParseEmbedded` 恒 `false`）。
- 输出经自定义 `ContentHandler` 截断，硬上限 100,000 字符（配置不可超过硬上限）。
- 换行统一为 `\n`，去首尾空白；空文本视为失败（`EMPTY_TEXT`）。

### 7.7 规则技能匹配（`technical-skills-v1`）

| 环节 | 规则 |
| --- | --- |
| 词典 | 23 个技术词，含别名（如 `Spring Boot/springboot`、`Kubernetes/k8s`、`REST API/restful api`） |
| 归一化 | NFKC → 小写（`Locale.ROOT`）→ 连续空白折叠为单空格 → trim |
| 边界 | 前后不得为拉丁字母或数字：`(?<![\p{IsLatin}\p{N}])…(?![\p{IsLatin}\p{N}])` |
| 重叠消解 | 所有命中按长度降序、同长度按词典定义顺序，贪心接受互不重叠者；同一技能只计一次 |
| 效果举例 | `java script` 命中 `JavaScript` 后，不再把其中 `java` 计为 `Java` |
| 评分 | `round(命中数 / 岗位识别技能数 × 100)`；岗位无技能 → `score=null, comparable=false` |
| 排序 | 可比较优先 → 分数降序 → 岗位创建时间降序 → id 降序（四段键，结果稳定） |
| 范围 | 最近 100 个 `OPEN` 岗位；请求时计算，不落库 |
| 明确不做 | 不处理否定语义（「不会 Java」仍会命中）、不识别年限/熟练度、不做同义词推理 |

### 7.8 前端状态与请求治理

- **路由**：`/`（登录）、`/register`、`/applicant-dashboard`、`/admin-dashboard`（需 `ROLE_ADMIN`）、`/oauthlogon`。
- **守卫**：`ProtectedRoute` 有 token 但无角色时，先 `GET /api/auth/details` 复原身份；失败则清会话并回登录页；角色不匹配回落到各自工作台。
- **会话失效**：`useSessionTimeout` 统一拦截 `401` → 清 `localStorage.token` + 重置 Redux → 跳登录页并提示。
- **请求去重**：列表、上传、详情、下载、匹配各有 `inFlight` 标记/集合，避免重复点击产生并发请求。
- **轮询**：仅当存在 `QUEUED/PROCESSING` 时每 2s 拉列表；静默失败立即暂停并提示，恢复后自动继续。
- **按需加载**：解析文本与匹配结果都在用户展开时才请求。
- **可访问性**：`aria-expanded` / `aria-controls`、`role="status"` / `role="alert"`、可见键盘焦点、44px 最小点击区、遵循 `prefers-reduced-motion`。

---

## 8. 主要技术难点与取舍

| # | 难点 | 方案 | 代价 / 边界 |
| --- | --- | --- | --- |
| 1 | 文件、数据库、消息三者无法原子提交 | Outbox + 同事务写入 + 失败补偿删文件 | 至少一次语义，允许重复投递；需要消费端幂等 |
| 2 | 多实例同时扫 Outbox 会重复发布 | 行锁领取 + 实例 ID + 30s 租约 | 租约过期后同一事件可能被再次领取 |
| 3 | 缓存成为新的单点故障 | fail-open + 500ms 短超时 | 故障期间数据库承压上升；指标只能事后发现 |
| 4 | 指标基数爆炸 | 标签只用有限枚举；key 不进标签 | 无法按具体 key 定位热点 |
| 5 | 恶意/畸形文件 | 魔数 + ZIP 结构 + 解压上限 + 条目上限 + 双层大小校验 | 仍是同进程解析，CPU/内存无硬隔离 |
| 6 | 词表匹配的误报 | NFKC + 词边界 + 长别名优先 + 重叠消解 | 否定句、上下文语义仍无法处理 |
| 7 | 外部身份令牌的安全边界 | 删除直接回传 IdP token 的端点，改为应用自签 JWT | OAuth 回跳仍把 token 放在 URL fragment，未主动清除历史 |
| 8 | 管理员任意改状态是否合法 | 显式接受：只校验角色与枚举，不做状态机约束 | 业务上可能出现「已拒绝 → 已录用」等跳转 |
| 9 | 前后端职责划分 | 后端唯一安全边界；前端守卫只做体验 | 前端仍持有 token，XSS 可读取 |
| 10 | 本地开发与生产差异 | Compose 覆盖文件 + 环境变量强制必填 | 单机 Compose，非编排平台；无滚动升级 |

---

## 9. 可观测性与性能

### 9.1 观测能力

| 能力 | 实现 | 访问方式 |
| --- | --- | --- |
| 健康检查 | Actuator `/actuator/health`，`show-details=never` | 匿名 |
| 指标 | Actuator `/actuator/prometheus`，仅暴露 `health` 与 `prometheus` | 需 ADMIN |
| 追踪 | OTel Java Agent 自动埋点 → Collector（memory_limiter + resource + batch）→ Jaeger | `http://localhost:16686` |
| 采样 | 本地 1.0；生产 0.1（`parentbased_traceidratio`） | 环境变量覆盖 |
| 日志 | 应用日志；认证失败**不记录**账号标识与 token 派生数据 | 容器日志 |

### 9.2 基准方法（`scripts/benchmark/Measure-JobCache.ps1`，698 行）

| 项 | 设定 |
| --- | --- |
| 对照 | 同一 backend 镜像，依次 `SPRING_CACHE_TYPE=none` 与 `redis` |
| 数据 | 原有 1 条 + 经管理员 API 临时创建 100 条 `OPEN` 岗位 = 101 条 |
| 参数 | 每场景 5 轮 × 200 请求 = 1,000 次计时请求；并发 20；预热 50 次 |
| 公平性 | 两场景响应条数与响应体 SHA-256 必须一致；`SPRING_JPA_SHOW_SQL=false` |
| 隔离性 | Redis 场景只删已知键 `offerpilot::jobs-open::all`，不执行 `FLUSHDB/FLUSHALL` |
| 可恢复 | `finally` 先恢复原缓存模式，再按**捕获的具体 ID** 删除 fixture，最后校验数量与 SHA-256 复原 |
| 产物 | 机器可读 JSON + 文本报告，含 QPS、P50/P95/P99、回源计数、清理校验结果 |

### 9.3 结果（2026-09-13，本地 Docker）

| 轮次 | 无缓存 P95 | Redis P95 | P95 变化 | Repository 回源 |
| --- | ---: | ---: | ---: | --- |
| 1 | 120.15 ms | 93.48 ms | −22.20% | 1,000 → 0 |
| 2 | 124.62 ms | 108.29 ms | −13.10% | 1,000 → 0 |
| 3 | 123.57 ms | 90.96 ms | −26.39% | 1,000 → 0 |
| 均值 | 122.78 ms | 97.58 ms | **−20.56%** | 1,000 → 0 |

### 9.4 解释边界（必须随数字一起引用）

- 这是**同机、本地 Docker、101 条数据、并发 20** 的受控实验，不代表生产容量或 SLA。
- **吞吐与 P50/P99 在三轮中方向不一致**，受调度与短时抖动影响，不作为结论。
- `offerpilot_job_repository_loads_total` 只统计 `getOpenJobs` 方法体执行次数，不等于任意 SQL 数量。
- hit/miss 是**单进程自启动累计**，不是 Redis 服务端全局命中率。
- 项目文档明确要求：正式记录时必须保持 `SPRING_JPA_SHOW_SQL=false`，且 100 条不是通用标准。

---

## 10. 工程质量

### 10.1 测试布局与规模

| 层 | 工具 | 规模（源码统计） | 覆盖重点 |
| --- | --- | --- | --- |
| 后端单元/集成 | JUnit 5、Spring Boot Test、H2（`MODE=MySQL`）、Mockito | 31 个测试类、177 个 `@Test` | 控制器契约、安全边界（401/403）、缓存 fail-open、Outbox 领取与退避、解析幂等、文件校验、Tika 提取、匹配排序 |
| 前端单元/组件 | Vitest、Testing Library、MSW、happy-dom | 15 个测试文件、98 个 `it/test` | 登录/注册、路由守卫、后台各面板、简历工作台（轮询、暂停、重试）、i18n |
| 端到端 | Playwright | 4 个 spec、8 条用例 | 管理员 CRUD、申请状态流转、可见性隔离、表单校验 |

> 口径说明：后端数字为 `@Test` 注解计数（另含 1 个 `@ParameterizedTest`）；前端为 `it(`/`test(` 调用计数。上游基线为后端 94 项、前端 13 文件 / 75 项（`UPSTREAM.md`）。

### 10.2 数据库演进

- Flyway 版本化：`V1` Java 基线（兼容既有库，不强制重建）+ `V2–V4` SQL（描述长度、岗位状态、用户启停）+ `V5` 建 `resumes` + `V6` 增加解析字段与 `resume_outbox` + `V7` 对齐 H2 的 `LONGVARCHAR`。
- 运行时 `ddl-auto=validate`：实体与表结构不一致会在启动阶段失败，而不是线上报错。
- `V6/V7` 用 `DatabaseMetaData` 判断 MySQL/H2，分别使用 `LONGTEXT` 与 `CLOB/LONGVARCHAR`，保证测试库与生产库都能通过校验。

### 10.3 构建与 CI

- 后端镜像：多阶段构建；`RUN --mount=type=cache,id=offerpilot-maven` 复用 `~/.m2`；运行阶段 `eclipse-temurin:21-jre-alpine` + OTel Java Agent 自动挂载。
- 前端镜像：`node:20-alpine` 构建（`outDir=build`）→ `serve -s build -l 5173` 静态托管。
- CI：`push main` 触发；JDK 21 + Node 24；依次跑后端测试、前端测试、打包、构建双镜像；Docker Hub 凭据存在时才登录与推送。

### 10.4 文档资产

| 文档 | 内容 | 归属 |
| --- | --- | --- |
| `README.md` / `README.zh-CN.md` | 英文/中文项目说明、接口、配置、基准 | 英文基于上游并本地更新；中文为本地新增 |
| `docs/architecture.md` | 分层与运行时边界、Mermaid 图 | 上游 |
| `docs/architecture-walkthrough.md` | 面试向架构讲解 | 上游 |
| `docs/adr/0001–0014` | 14 篇架构决策记录 | 上游（0005 本地补充说明） |
| `docs/performance/README.zh-CN.md` | 基准方法与解释边界 | 本地 |
| `docs/performance/results/2026-09-13-redis-cache.md` | 三轮原始结果与简历表述建议 | 本地 |
| `docs/design/*.md`、`frontend/DESIGN.md` | 前端设计系统与改进计划 | 本地 |
| `UPSTREAM.md` | 上游来源、许可、二次开发原则 | 本地 |

---

## 11. 成果归属（原创 / 二次创作 / 上游）

### 11.1 三级定义

| 等级 | 定义 | 判断标准 |
| --- | --- | --- |
| **A. 原创新增** | 本地从零新增的文件与模块 | 该路径在 `559928f` 中不存在 |
| **B. 二次创作** | 基于上游文件做实质修改或重构 | 路径存在，但本地提交有功能性改动 |
| **C. 上游保留** | 原样引入，未做功能性改动 | 仅出现在 `559928f`，或仅文档微调 |

### 11.2 归属矩阵

| 模块 | 等级 | 说明 |
| --- | --- | --- |
| 简历上传（校验、净化、存储、补偿删除、SHA-256） | **A** | `ResumeService`、`ResumeFileValidator`、`LocalResumeStorage`、`ResumeController`、V5 迁移 |
| 简历异步解析（Outbox、发布器、消费者、Tika 提取、DLQ） | **A** | `ResumeOutboxService/Publisher`、`ResumeParseProcessor/Listener`、`TikaResumeTextExtractor`、V6/V7 |
| 规则技能匹配 | **A** | `TechnicalSkillMatcher`、`ResumeJobMatchService`、匹配 DTO 与前端 `ResumeMatches` |
| 简历前端工作台 | **A** | `ResumePanel`、`ResumeMatches`、`resumePanelUtils`、轮询与暂停逻辑 |
| Redis 岗位缓存 + fail-open | **A** | `CacheConfig`、`FailOpenCacheErrorHandler`、`JobCacheNames`（`JobService` 为 B） |
| 缓存指标 | **A** | `JobCacheMetricsBinder`、`JobRepositoryLoadMetrics`、Actuator 暴露收敛 |
| 缓存对照基准工具 | **A** | `scripts/benchmark/Measure-JobCache.ps1`（698 行）+ 结果文档 |
| 安全收敛（删 OAuthController、OIDC→应用 JWT、响应收敛） | **B** | 修改上游 `SecurityConfig`、`JwtUtil`、`LoginController`、`ApplicationController`，新增 `OidcLoginSuccessHandler` |
| 岗位/投递服务与控制器 | **B** | 上游骨架，本地加缓存注解、状态与错误码调整 |
| 用户管理边界（仅启停求职者、遗留端点 410） | **C** | `UserController` 自上游引入后未改动，边界为上游既有设计 |
| OIDC 账号映射防护（拒绝与本地/管理员账号隐式绑定） | **A** | `UserService.createOrUpdateGoogleApplicant` 为本地新增 |
| 前端中文化 + 工作区重写 + 响应式 | **B** | 组件结构沿用上游，文案、样式、交互大量重写 |
| 岗位 CRUD、投递生命周期基础 | **C** | 上游已具备，仅做局部增强 |
| 基础 JWT 签发/校验、Spring Security 过滤链骨架 | **C**（能力） | 能力为上游；`JwtUtil` 与 `SecurityConfig` 在本地有安全收敛（见上方 B 行） |
| React 路由、Redux store、登录/注册组件骨架 | **C** | 上游已具备（本地改文案与交互） |
| Flyway 引入、V1–V4 迁移 | **C** | 上游 |
| OpenTelemetry / Jaeger 接入、Collector 配置 | **C** | 上游（本地调采样率与 Compose 编排） |
| 多架构镜像 `docker-bake.hcl`、GitHub Actions 流水线 | **C** | 上游 |
| 14 篇 ADR、架构文档 | **C** | 上游 |
| MIT 许可证与原作者版权 | **C** | 必须保留 |

### 11.3 数量口径

| 指标 | 数值 | 计算方式 |
| --- | --- | --- |
| 本地提交 | 18 | `git log --oneline 559928f..HEAD` 去掉快照提交 |
| 变更文件 | 150 | `git diff --shortstat 559928f..HEAD` |
| 新增 / 删除行 | +9,865 / −2,258 | 同上 |
| 后端主代码 | 65 文件，+2,589 / −271 | `git diff --stat -- src/main` |
| 后端测试 | 27 文件，+2,520 / −73 | `git diff --stat -- src/test` |
| 前端源码 | 31 文件，+2,550 / −1,298 | `git diff --stat -- src` |

> 注意：这些是**变更行数**，不等于「从零写了 9,865 行」；其中包含重写、删除与测试。

### 11.4 负面清单（不得声称）

- ❌ 不得声称「从零设计并实现整个求职平台」——岗位 CRUD、投递生命周期、基础认证、Compose 骨架、CI 为上游。
- ❌ 不得声称「实现了 AI 简历匹配 / 语义理解 / 推荐算法」——是有限词典的规则覆盖率。
- ❌ 不得声称「实现了分布式事务」——是 Outbox + 补偿 + 幂等的最终一致方案。
- ❌ 不得声称「缓存提升吞吐 X 倍」——吞吐方向不稳定，只有 P95 与回源次数可引用。
- ❌ 不得声称「高可用文件存储」——单实例本地磁盘，多副本不共享。
- ❌ 不得把 14 篇 ADR、多架构构建、GitHub Actions 写成本人成果。

---

## 12. 已知限制

| # | 限制 | 影响 | 可行的演进方向 |
| --- | --- | --- | --- |
| 1 | 简历为单实例本地存储 | 多副本不共享文件，无跨节点一致性 | 实现 `ResumeStorage` 的 MinIO/S3 版本 |
| 2 | Tika 在应用 JVM 内解析 | 恶意文档可能消耗 CPU/内存 | 独立解析进程 + 容器资源配额 |
| 3 | JWT 存 `localStorage` | XSS 可读取令牌 | 改用 HttpOnly Cookie + CSRF 防护，或短期令牌 + 刷新令牌 |
| 4 | OAuth 回跳把 token 放 fragment 且未清除 | 令牌留在浏览器历史 | 读取后 `history.replaceState` 清除 |
| 5 | CSRF 全局关闭 | 依赖 Bearer 头而非 Cookie；若改 Cookie 方案需重新开启 | 与 #3 一并处理 |
| 6 | 无限流 / 验证码 | 登录与上传可被暴力尝试 | Bucket4j / 网关限流 + 验证码 |
| 7 | 无简历删除接口 | 用户无法撤回已上传文件 | 软删除 + 对象存储生命周期 |
| 8 | 列表接口无分页 | 岗位/投递/简历全量返回 | 游标分页（`created_at, id`） |
| 9 | 管理员改投递状态无迁移约束 | 可能出现不合理跳转 | 显式状态机 + 审计日志 |
| 10 | 用户管理无审计 | 停用操作不可追溯 | 事件表 + 操作人/时间 |
| 11 | 匹配仅覆盖 23 个技术词 | 词典外技能完全不可见 | 词典配置化 / 引入标准化技能本体 |
| 12 | 缓存统计为单进程 | 多副本无法汇总 | 改用 Redis INFO 或集中式指标 |
| 13 | 无跨实例的 Outbox 监控面板 | 积压需查库或日志 | 暴露 pending/age 指标 + 告警 |
| 14 | 集成测试用 H2（`MODE=MySQL`），不是真实 MySQL | 方言/锁行为与生产存在差异 | V6/V7 已按数据库分支写迁移；可启用已声明的 Testcontainers 做真库回归 |

---

## 13. 术语表

| 术语 | 英文 / 代码标识 | 定义 |
| --- | --- | --- |
| 岗位 | Job | 招聘职位记录，状态 `OPEN/CLOSED` |
| 投递 | Application | 求职者对岗位的申请记录，唯一约束为用户+岗位 |
| 简历 | Resume | 上传的 PDF/DOCX 文件及其解析结果 |
| 解析 | Parse / Extract | 从文件二进制中提取纯文本的过程 |
| 发件箱 | Outbox | 与业务数据同事务写入的待发送事件表 |
| 领取租约 | Claim lease | 实例对某条 Outbox 事件的临时独占期（默认 30s） |
| 发布确认 | Publisher confirm | Broker 确认消息已持久化 |
| 强制退回 | Mandatory return | 消息无法路由时 Broker 退回给发布者 |
| 死信队列 | DLQ | 重试耗尽后的最终落点 |
| 幂等 | Idempotency | 同一消息重复消费不产生额外副作用 |
| 降级 / 失效开放 | Fail-open | 依赖故障时保持主流程可用 |
| 回源 | Cache miss → DB | 缓存未命中时查询数据库 |
| 技能覆盖率 | Skill coverage | 命中技能数 ÷ 岗位识别技能数 |
| 可比较 | comparable | 岗位是否识别到词典技能；否时为 `false` |
| 上游基线 | Upstream snapshot | `559928f`，对应上游 `0d3e98b` |
| 本地增量 | Local delta | `559928f..9b35ff3` 的 18 次提交 |
| 二次开发 | Secondary development | 在上游基础上新增/重构，需保留 MIT 声明 |

---

## 14. 事实索引（供核查，不必逐条阅读）

| 事实 | 代码/文档位置 |
| --- | --- |
| 缓存名、TTL、key 前缀 | `application.yml` → `spring.cache` |
| fail-open 与指标标签 | `config/FailOpenCacheErrorHandler.java`、`observability/JobCacheMetricsBinder.java` |
| 缓存注解与失效策略 | `service/JobService.java` |
| Outbox 领取/退避 | `service/ResumeOutboxService.java` |
| 发布确认逻辑 | `messaging/ResumeOutboxPublisher.java`、`messaging/RabbitResumeMessageSender.java` |
| 队列/交换机/DLX 名称 | `messaging/ResumeMessagingConstants.java` |
| 消费重试与拒收 | `config/ResumeMessagingConfig.java` |
| 幂等与终态 | `service/ResumeParseProcessor.java` |
| 文件结构校验 | `service/ResumeFileValidator.java` |
| 存储原子写与路径防护 | `storage/LocalResumeStorage.java` |
| 上传补偿删除 | `service/ResumeService.java` |
| 文本提取上限与安全配置 | `service/TikaResumeTextExtractor.java` |
| 匹配算法与排序 | `service/TechnicalSkillMatcher.java`、`service/ResumeJobMatchService.java` |
| 授权规则 | `config/SecurityConfig.java` |
| 每请求重载用户 | `config/JwtAuthFilter.java` |
| OIDC → 应用 JWT | `config/OidcLoginSuccessHandler.java` |
| 表结构 | `src/main/java/db/migration/V1,V6,V7` + `src/main/resources/db/migration/V2–V5` |
| 基准脚本 | `scripts/benchmark/Measure-JobCache.ps1` |
| 性能结论与边界 | `docs/performance/README.zh-CN.md`、`docs/performance/results/2026-09-13-redis-cache.md` |
| 归属与许可 | `UPSTREAM.md`、`LICENSE`、`git log 559928f..HEAD` |

---

## 15. 运行与配置速查

### 15.1 启动

```powershell
docker compose up -d --build          # 全栈
docker compose ps                     # 状态
docker compose down                   # 停止（保留数据卷）
docker compose down -v                # 停止并清空本地数据（谨慎）
```

### 15.2 测试

```powershell
mvn -f job-portal-backend/pom.xml test          # 后端
cd job-portal-frontend; npm ci; npm run lint; npm test; npm run build
npx playwright install chromium; npm run test:e2e   # 需全栈已启动
```

### 15.3 关键环境变量

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `SPRING_CACHE_TYPE` | `redis` | `none` 可关闭缓存（基准对照用） |
| `CACHE_TTL` | `5m` | 缓存过期时间 |
| `CACHE_KEY_PREFIX` | `offerpilot::` | 缓存键前缀 |
| `REDIS_CONNECT_TIMEOUT` / `REDIS_COMMAND_TIMEOUT` | `500ms` / `500ms` | 缓存快速失败 |
| `RESUME_MAX_FILE_SIZE` / `RESUME_MAX_REQUEST_SIZE` | `5MB` / `6MB` | Web 层上传限制 |
| `RESUME_STORAGE_ROOT` | `./data/resumes` | 文件存储根目录 |
| `RESUME_TEXT_MAX_CHARACTERS` | `100000` | 提取文本上限（硬上限同值） |
| `RESUME_OUTBOX_POLL_INTERVAL` / `BATCH_SIZE` / `CLAIM_LEASE` | `1s` / `20` / `30s` | Outbox 扫描与租约 |
| `RESUME_OUTBOX_INITIAL_BACKOFF` / `MAX_BACKOFF` | `1s` / `1m` | 发布失败退避 |
| `RESUME_PARSE_MAX_ATTEMPTS` | `3` | 消费解析总尝试次数 |
| `RESUME_PARSE_INITIAL_BACKOFF` / `MAX_BACKOFF` | `500ms` / `5s` | 消费重试退避 |
| `JWT_SECRET_KEY` | 本地占位值 | HS256 密钥（生产必填且 ≥256 bit） |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS 白名单 |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | OAuth 回跳基址 |
| `OTEL_TRACES_SAMPLER_ARG` | 本地 `1.0` / 生产 `0.1` | 采样率 |

---

## 16. 相关文档

| 文档 | 用途 |
| --- | --- |
| `README.zh-CN.md` | 面向人的功能与接口说明 |
| `docs/architecture.md` | 架构边界与 Mermaid 图 |
| `docs/adr/` | 14 篇架构决策记录（上游） |
| `docs/performance/README.zh-CN.md` | 基准方法与解释边界 |
| `docs/resume-points.md` | 简历措辞素材（本文的派生物，不含额外事实） |
| `UPSTREAM.md` | 上游来源与二次开发原则 |
