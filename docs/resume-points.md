# OfferPilot 求职管理平台 · 项目完整性与简历素材

> 更新：2026-11-22。事实基线：当前工作区代码与最近一次本地验证（2026-11-18）。
> 上游：`jrodolfo/job-portal`（MIT，快照 `559928f`）；本项目在其上二次开发，岗位 CRUD、基础 JWT、Compose 骨架、CI、ADR 属上游既有能力，不能写成个人从零实现。
> 本文只写能追溯到代码/测试/运行记录的内容；红线见第六节。

---

## 一、项目完整性检查（先看这一节）

### 1.1 一句话结论

**功能与工程质量已达到可写进简历、可现场演示的水平；2026-11 UI 改版、文档与截图已提交并推送到 `main`。剩余交付项是线上 Demo 与 Google OAuth 真实凭据（GitHub 仓库已确认 public，README 截图可正常加载）。**

粗略评分（个人项目口径，不是生产系统）：

| 维度 | 评分 | 说明 |
|---|---|---|
| 功能完整度 | 8 / 10 | 双角色主链路完整；缺分页、简历删除、个人资料、限流等 |
| 工程质量 | 9 / 10 | 构建/测试/迁移/文档/可观测性齐全；无覆盖率门禁、E2E 未进 CI |
| 交付完整度 | 8 / 10 | 已提交、推送并确认 public；仍无线上地址 |
| 面试可讲深度 | 9 / 10 | Outbox、缓存一致性、文件安全、规则匹配都有可追问细节 |

### 1.2 功能完整性（真实存在 / 真实缺失）

**已实现且验证过**

- 邮箱密码注册/登录、JWT 会话、Google OIDC 登录代码链路、角色路由守卫、401 统一失效处理。
- 求职者：浏览开放岗位、投递、撤回、撤回后再投、查看状态与时间。
- 简历：PDF/DOCX 上传（≤5 MiB）、异步解析、状态轮询、展开查看解析文本、下载原文件、规则技能匹配。
- 管理员：岗位创建/编辑/关闭/重开/删除；投递按状态分组、搜索/筛选/排序、修改状态；用户列表、启用/停用求职者。
- 基础设施：Redis 岗位缓存 + fail-open、Micrometer 指标、OTel/Jaeger、Swagger、Flyway 迁移、Docker Compose 七服务。
- 前端：React 19 双工作台；2026-11 完成认证页/工作台/后台视觉改版，320–1920 响应式、键盘页签、用户菜单、密码显隐、自定义文件选择、可见焦点。
- 测试：后端 31 个测试类 / 179 个用例（0 失败，1 个 Windows 符号链接用例跳过）；前端 16 文件 / 106 用例；Playwright 6 个规格 / 10 条用例。

**部分实现/有前提**

- Google 登录：代码完整，但 `GOOGLE_CLIENT_ID/SECRET` 仍是占位值；未完成真实第三方授权，页面上按钮仍在，演示时可能走到 Google 报错。
- 岗位检索：求职者侧没有搜索/筛选/分页；管理端搜索/筛选/排序都在前端对全量数组计算，后端无分页参数。
- 简历匹配：23 个技术词的规则覆盖率，不是 AI / 语义匹配；无年限、职级、同义词推理。
- 文件存储：单实例本地磁盘；`ResumeStorage` 接口可替换 MinIO，但当前不共享、不冗余。
- 安全：JWT 放在 `localStorage`；无登录限流/验证码；CSRF 关闭（Bearer 方案下的取舍）；默认 JWT 密钥只适合本地。

**明确没有**

- AI 简历生成/优化/评分、招聘决策、录用概率。
- 简历在线编辑、模板、版本管理、导入/导出、删除。
- 个人资料编辑、改密、消息通知、站内信。
- 分页、批量操作、导出报表、审计日志、多租户。
- 线上部署地址、监控大盘、生产级 SLA。

> **命名红线**：不要把这个项目叫「AI 简历招聘平台」。代码与文案都明确写了「规则覆盖率，不代表 AI 评估」。如果投 AI 岗，需要先真实补一个 LLM 功能并做评测，不能只改名字。

### 1.3 工程与验证（本次重新跑过）

| 检查 | 结果 |
|---|---|
| 后端 `mvn -o test` | 32 份报告 / 179 用例 / 0 失败 / 0 错误 / 1 跳过（Windows 符号链接权限，Linux 已补验 3/3） |
| 前端 `npm test` | 16 文件 / 106 用例全部通过 |
| 前端 `npm run lint` | 通过 |
| 前端 `npm run build` | 通过（137 模块，CSS 262.48 kB / JS 441.37 kB） |
| 非写库 UI E2E | 4 项通过（三尺寸布局、六状态、长文本），重采 32 张截图 |
| 真实运行验证 | 2026-11-18 用真实 MySQL/Redis/RabbitMQ 跑通注册登录、岗位 CRUD、投递/撤回/再投、PDF/DOCX 解析、匹配、下载、后台审核、停用会话失效 |
| 规模事实 | 27 个 REST 业务端点；5 张业务表；7 个 Flyway 迁移；7 个 Compose 服务；14 篇 ADR（上游） |

### 1.4 交付/仓库现状（2026-11-22 更新）

- 已提交并推送：`114e0e3`（UI 改版）、`adfe5e2`（文档/截图）、`68d137a`（`.env.example`、`.gitignore`、CI）、`933b7d6`（交付状态）；`origin/main` 已与本地一致。
- 已确认 `https://github.com/zz26max/offerpilot` 返回 200，README 与 `docs/ui-redesign/screenshots/login-1440x900.png` 均可公开访问。
- 已添加 `.env.example`；`.workbuddy/`、`test-results/`、本地开发日记已加入 `.gitignore`。
- CI 镜像名已改为 `${{ github.repository_owner }}/offerpilot-*`，并新增前端 lint 步骤；推送后已触发一次 GitHub Actions（以 Actions 页面最新结果为准）。
- **仍无线上 Demo**；Google OAuth 凭据未配置；版本号仍为 `0.2.0`（未 bump）；CI 仍未跑 E2E。

**结论：仓库已可交付、可公开访问；线上 Demo 与 OAuth 凭据是剩余项。**

### 1.5 面试时的诚实口径

> 「这是一个基于 MIT 开源求职平台二次开发的项目。上游已有岗位 CRUD、基础 JWT 和 Compose 骨架；我主要负责简历异步处理链路、规则匹配、Redis 缓存与可观测性、认证边界收敛，以及最近一轮前端工作台改版。」

这句话比「独立从零开发招聘平台」更安全，也能把追问引到你真正做过的地方。

---

## 二、简历可直接用的写法

### 2.1 项目头

**OfferPilot 求职管理平台**（个人项目 / 基于 MIT 开源项目二次开发）
`Java 21 · Spring Boot 3.4 · MySQL 8 · Redis 7 · RabbitMQ 4.2 · React 19`
2026.09 – 2026.11（把 UI 改版提交后可将结束时间改为实际月份）

### 2.2 一句话版

> 基于 Spring Boot 3.4 / React 19 二次开发求职管理平台，独立完成简历「上传 → 异步解析 → 规则匹配」链路、Redis 缓存与可观测性、上传/认证安全加固，并完成双角色工作台的前端改版。

### 2.3 后端实习版（推荐，3 条）

1. **简历异步处理链路**：设计 Transactional Outbox + RabbitMQ + Apache Tika 方案，文件落盘与事件同事务提交；以 30s 租约 + 行锁领取事件，publisher confirm/mandatory return 判定发布成功，消费端行锁幂等 + 指数退避 + DLQ，实现上传接口与文档解析解耦。
2. **Redis 缓存与降级**：为岗位列表/详情接入 `@Cacheable` 与精确失效，`transactionAware` 避免脏读；自定义 `CacheErrorHandler` 实现 fail-open，Micrometer 暴露命中/失败指标；自建可切换缓存模式的对照基准，P95 122.78→97.58ms（−20.56%，本地受控实验），回源 1000→0。
3. **安全与可解释匹配**：按魔数/ZIP 结构校验 PDF/DOCX、限制解压总量防 zip bomb、UUID+白名单+路径归一化防穿越、越权统一 404；OIDC 外部令牌改为应用自签 JWT 并按 HTTP 方法授权；实现 23 词规则匹配（NFKC/词边界/长别名优先/四段排序），输出可解释命中与「不可比较」，明确非 AI 评估。

### 2.4 后端实习版（5 条，空间够时）

1. 在开源求职平台上二次开发，负责简历域：上传、异步解析、状态机、下载、匹配与对应前端工作台。
2. 用 Transactional Outbox 解决「文件已落盘、数据库已提交、消息未发送」的双写不一致；publisher confirm + 租约 + 消费幂等 + DLQ，Broker 故障不阻塞启动。
3. 为三处热点读加 Redis 缓存与 fail-open；用 Micrometer 暴露 hit/miss 与降级计数，标签只用有限枚举，避免指标基数爆炸。
4. 加固上传与权限边界：结构校验、zip bomb 限制、原子落盘、越权 404、OIDC→应用 JWT、方法级角色授权。
5. 用 Flyway 管理 7 个迁移、`ddl-auto=validate` 锁 schema；测试总量后端 179 / 前端 106 / E2E 10 条。

### 2.5 全栈/前端实习版（3 条）

1. 使用 React 19 + Redux Toolkit + React Router 7 完成求职者/管理员双工作台，封装 `ProtectedRoute` 恢复角色、401 统一清理会话、简历轮询与请求去重。
2. 2026-11 完成全站视觉改版：抽出 `AuthBrand` / `AuthInput` / `Icon` 共享组件，统一色彩/圆角/控件高度；实现 320–1920 响应式、2×2 后台页签、键盘可操作的用户菜单与页签、自定义文件选择、可见焦点与 `prefers-reduced-motion`。
3. 用 Vitest + Testing Library + MSW 覆盖 106 个用例，Playwright 覆盖 10 条真实浏览器流程；在 1440/390/1920 三尺寸下校验无横向溢出、控件 ≥44px。

### 2.6 技术栈一行版

`Java 21 · Spring Boot 3.4 · Spring Security（JWT/OIDC）· JPA · Flyway · MySQL 8 · Redis 7 · RabbitMQ 4.2 · Tika 3.3 · Micrometer/Prometheus · OTel/Jaeger · React 19 · Vite 6 · Redux Toolkit · React Router 7 · Vitest/Testing Library/MSW/Playwright · Docker Compose · GitHub Actions`

### 2.7 量化口径（写简历时带上边界）

| 指标 | 数值 | 口径 |
|---|---|---|
| 缓存 P95 | 122.78 → 97.58 ms（均值 −20.56%） | 101 岗位 / 并发 20 / 每场景 1,000 请求 / 3 轮，本地 Docker |
| 单轮 P95 降幅 | −13.10% ~ −26.39% | 同上；吞吐/P50/P99 方向不稳定，不写 |
| Repository 回源 | 1,000 → 0 | 计时阶段 |
| 后端测试 | 179 用例（178 通过，1 跳过） | 31 个测试类；Windows 符号链接限制 |
| 前端测试 | 106 用例 | 16 文件；Vitest + Testing Library + MSW |
| E2E | 10 条用例 / 6 规格 | Playwright；本轮非写库 4 条通过 |
| 业务端点/表/迁移 | 27 / 5 / 7 | 代码统计 |
| 规模（committed） | 20 commits / 152 文件 / +10,093 −2,258 | `559928f..HEAD`；**不含未提交 UI 改版**，简历不必写 |

---

## 三、核心技术点（按面试权重）

### P0-1 Transactional Outbox + RabbitMQ + Tika

- 上传只做三件事：校验、落盘、在**同一事务**写 `Resume(QUEUED)` + `ResumeOutboxEvent(PENDING)`；事务失败补偿删文件，`addSuppressed` 保留根因。
- 发布器每 1s 扫 Outbox：`PESSIMISTIC_WRITE` 领取、实例 ID + 30s 租约、批量 20；只有 publisher confirm 且未被 mandatory return 才 `PUBLISHED`，失败按 1s→1m 退避。
- 消费端：`findByIdForUpdate` 行锁 → 已成功直接返回、已失败拒绝、其余置 `PROCESSING` → Tika 提取 → `SUCCEEDED`；失败独立事务记 attempts，3 次后 `FAILED`，异常上抛触发重试，耗尽进 DLQ。
- 代价：at-least-once，允许重复投递；用消费端幂等兜底；租约过期可能重复领取；文件存储在单机。

### P0-2 Redis 缓存 + fail-open + 指标

- 三个缓存名：`jobs-open` / `jobs-all` / `job-by-id`，TTL 5m，key 前缀 `offerpilot::`；写操作 `@Caching(evict)`，`transactionAware()` 延迟到事务提交。
- `FailOpenCacheErrorHandler` 吞掉读/写/失效/清空异常，只 WARN + 计数，业务回落数据库。
- 指标标签只用 `cache/result/operation` 有限枚举，避免 key/用户信息进标签。
- 自建 698 行 PowerShell 基准：切 `SPRING_CACHE_TYPE=none|redis`，经管理 API 建 100 条 fixture，校验响应数量与 SHA-256 一致，`finally` 恢复缓存模式并逐条清理。
- 可被追问：缓存穿透/击穿/雪崩没有专项治理（只有 TTL + 空值不缓存），不要过度包装。

### P1-1 上传安全

- PDF `%PDF-` 魔数；DOCX 解 ZIP 校验 `[Content_Types].xml` + `word/document.xml`；限制 2,048 条目 / 64 MiB 解压总量。
- 存储 `UUID + 白名单正则 + normalize().startsWith(root)`；先写 `.tmp` 再 `ATOMIC_MOVE`；失败清理。
- 5 MiB 双层校验、10 万字符提取上限、解析 3 次；越权访问统一 404，响应剔除存储键与内部异常。
- 边界：Tika 在应用 JVM 内解析，不是恶意文档硬隔离；没有杀毒。

### P1-2 认证与授权收敛

- 删除上游把 Google ID Token 回传前端、并用 client secret 换 token 的 `OAuthController`；改为 OIDC 校验（`email_verified`）后签发本应用 HS256 JWT。
- `JwtAuthFilter` 每请求从库重载用户并检查 `enabled`，停用立即生效。
- `SecurityConfig` 按 HTTP 方法授权；401/403 统一 JSON；简历归属查询用 `findByIdAndUser_EmailIgnoreCase`，他人资源与不存在都 404。
- OIDC 只允许创建/更新 GOOGLE+APPLICANT+enabled 账号，避免 OAuth 接管本地/管理员账号。
- 已知风险：JWT 在 localStorage（XSS 可读）；无刷新令牌/限流；CSRF 关闭依赖 Bearer。

### P1-3 可解释的规则匹配

- `technical-skills-v1`：23 个技术词 + 别名；NFKC、小写、空白折叠；`(?<![\p{IsLatin}\p{N}])` 词边界；长别名优先消解重叠（`java script` 不会算成 `Java`）。
- 评分 = 命中数 / 岗位识别技能数；岗位无词典技能 → `score=null, comparable=false`，前端显示「不可比较」。
- 四段排序保证稳定：可比较 → 分数降序 → 创建时间降序 → id 降序；算法版本随响应返回。
- 边界：否定语义、年限、熟练度、同义词都不处理；不是 AI。

### P2-1 前端与改版

- React 19 + Redux Toolkit + Router 7；`ProtectedRoute` 先用 token 拉 `/api/auth/details` 复原角色；401 清会话回登录。
- 简历工作台：仅展开时加载文本/匹配；QUEUED/PROCESSING 才轮询；静默失败暂停轮询并支持手动刷新；上传/下载/匹配用 in-flight 标记防重复。
- 2026-11 改版：认证页 40:60 双栏 + O 环品牌；共享 `AuthBrand/AuthInput/Icon`；自定义文件选择（真实 input + 按钮 + 文件名）；状态色六态可区分；只读状态不再渲染重复按钮；后台页签 roving tabindex + 方向键；320/390/600/768/900/1024/1440/1920 无横向溢出，控件 ≥44px，可见焦点。
- 测试：Vitest + Testing Library + MSW；Playwright 三尺寸、六状态、长文本。

### P2-2 工程化

- Flyway V1（Java baseline）+ V2–V5 SQL + V6/V7（Outbox/类型对齐），`ddl-auto=validate`；H2 测试与 MySQL 方言差异有专门迁移。
- 测试金字塔：控制器契约、安全边界 401/403、缓存 fail-open 集成测试、Outbox 领取/退避、解析幂等、文件校验、匹配排序、前端交互/E2E。
- Docker Compose 七服务；Swagger；Actuator/Prometheus；OTel→Jaeger；14 篇 ADR（上游）。
- CI：后端测试 → 前端测试 → JAR → 双镜像；**注意**：镜像名仍是 `jrodolfo/*`，且不跑 E2E/lint。

---

## 四、实现路线（从 0 到 1 的叙事）

| 阶段 | 要解决的问题 | 做法 | 关键取舍/证据 |
|---|---|---|---|
| 0. 基线评估 | 上游能跑但只有岗位 CRUD/投递 | 跑通上游测试；列出缺口：简历无载体、无异步解析、无匹配、无缓存 | 保留 MIT 声明；不把上游写进个人成果 |
| 1. 领域建模 | 简历文件与解析状态怎么存 | `Resume`（状态机 QUEUED/PROCESSING/SUCCEEDED/FAILED）+ `ResumeOutboxEvent`；Flyway V5–V7 | 状态机与 Outbox 同库，避免跨存储事务 |
| 2. 上传安全 | 不可信文件、路径穿越、zip bomb | 魔数/结构校验、5 MiB 双层、UUID 存储、临时文件原子移动、清理 | 解析与上传解耦的第一步 |
| 3. 可靠异步 | 文件落盘/DB/消息无法原子 | 同事务 Outbox；发布确认 + 租约 + 退避；消费行锁幂等 + DLQ | at-least-once，消费端兜底 |
| 4. 文本提取 | PDF/DOCX 二进制不可用 | Tika 按已校验 MIME 选解析器；关 OCR；限制字符数；空文本失败 | 解析在应用 JVM 内，明确资源边界 |
| 5. 规则匹配 | 可解释的简历-岗位比较 | 23 词词典 + 归一化 + 边界 + 重叠消解 + 覆盖率 + 四段排序 | 不用 AI，主动标注不可比较 |
| 6. 缓存与观测 | 热点读压力与故障放大 | 三缓存名、精确失效、transactionAware、fail-open、Micrometer | 缓存故障不升级为业务故障；基准自证 |
| 7. 认证边界 | 上游 OAuth 把外部 token 当凭证 | 删除危险端点、OIDC→应用 JWT、方法级授权、越权 404 | 兼容性与安全取舍 |
| 8. 前端工作台 | 简历状态不可见、操作重复 | 按需加载、轮询/暂停/恢复、请求去重、路由守卫 | 2026-11 再做视觉/响应式/可访问性改版 |
| 9. 工程化 | 回归与交付 | 单元/集成/E2E、Compose、Swagger、ADR、截图 | 仍缺分页/限流/线上部署 |

### 面试时的 3 分钟讲法（背这个骨架，不要背全文）

1. **20 秒背景**：求职管理平台，双角色；上游是 MIT 开源项目，我做的是简历域和基础设施增强。
2. **60 秒核心链路**：上传为什么不能直接发 MQ → 同事务 Outbox → confirm/租约 → 消费幂等 → 3 次重试 + DLQ；强调「至少一次 + 幂等」的取舍。
3. **45 秒缓存**：三处热点读、精确失效、fail-open、指标标签控制基数；一句「P95 本地对照 −20%，不外推生产」。
4. **30 秒安全**：文件结构校验/zip bomb/路径穿越；OIDC token 不当凭证、越权 404。
5. **25 秒边界**：规则匹配不是 AI、单机存储、无分页/限流；下一步会做对象存储与游标分页。

白板顺序：浏览器 → React（守卫/轮询）→ REST → Controller → Service/事务 → MySQL + Outbox → RabbitMQ → Consumer → Tika → 状态回写；旁边画 DLQ 与 Redis。

---

## 五、高频追问与回答要点

1. **为什么不用本地事务 + 直接发 MQ？**
   文件落盘、DB 提交、消息发送无法原子；先发消息可能丢 DB，先提交可能消息发不出去。Outbox 把「要发什么」与业务同事务落库，再由后台任务发送，失败可重试。
2. **多实例怎么避免重复发布？**
   `SELECT ... FOR UPDATE` 领取 + 实例 ID + 30s 租约；租约过期可能重复领取，靠消费端幂等兜底，这是 at-least-once 的正常代价。
3. **publisher confirm 和 mandatory return 分别解决什么？**
   confirm 确认 Broker 收到并持久化；mandatory 在消息无法路由时退回。两者都满足才算发布成功。
4. **消费端怎么幂等？**
   `findByIdForUpdate` 锁行；SUCCEEDED 直接返回；FAILED 抛不可重试；只有 QUEUED/PROCESSING 才解析。重复消息不会重复写文本。
5. **为什么 3 次后进 DLQ？**
   区分可重试（临时故障）与终态失败；重试配额避免无限重排，DLQ 保留人工排查入口。
6. **缓存一致性怎么保证？**
   写操作 `@Caching(evict)`，`transactionAware()` 延迟到提交后；TTL 兜底。没有强一致，接受短暂不一致。
7. **Redis 挂了会怎样？**
   `FailOpenCacheErrorHandler` 记录并计数，业务回落 DB；代价是 DB 压力上升，指标可发现。
8. **P95 −20% 可信吗？**
   同机、本地 Docker、101 条数据、并发 20、三轮；只报 P95 与回源，不报吞吐；不外推生产 SLA。
9. **文件校验为什么不信 Content-Type？**
   客户端可伪造；按魔数/ZIP 结构判断真实类型；再限制解压条目/总量防 zip bomb。
10. **Tika 在 JVM 内解析有什么风险？**
    恶意文档可能消耗 CPU/内存；当前有大小/字符上限，生产应独立进程 + 资源配额。
11. **JWT 放 localStorage 的风险？**
    XSS 可读；取舍是简单、无 Cookie CSRF；更稳的是 HttpOnly Cookie + CSRF 或短期 token + refresh。
12. **OIDC 改造解决了什么？**
    上游把 Google ID Token 直接回传、甚至暴露 client secret 换 token；改为服务端校验后签本应用 JWT，API 只认本应用 token。
13. **匹配为什么不是 AI？**
    23 词词典 + 正则边界，不处理语义/否定/年限；主动返回算法版本和「不可比较」，避免误导。
14. **前端轮询会不会打爆后端？**
    只在 QUEUED/PROCESSING 时 2s 轮询；静默失败暂停；展开才加载文本/匹配；请求去重。
15. **这个项目最难的点？**
    推荐答 Outbox 的失败窗口与幂等，或缓存故障不放大；不要答「页面多」。
16. **哪些是上游的？**
    岗位 CRUD、基础 JWT、Compose 骨架、CI、ADR；我新增/重构的是简历域、匹配、缓存/指标、认证收敛、前端改版与测试。
17. **下一步做什么？**
    游标分页、对象存储（MinIO）、登录限流、Outbox 积压指标/告警、覆盖率门禁、线上部署与 E2E。

---

## 六、事实边界与不能写的内容

- ❌ 不要写 AI / LLM / 语义匹配 / 智能评分 / 录用概率；代码里没有模型。
- ❌ 不要写「分布式事务」；这是 Outbox + 补偿 + 幂等的最终一致。
- ❌ 不要写「高并发/高可用/生产级」；单机文件存储、单库、无压测容量结论。
- ❌ 不要写「从零开发整个招聘平台」；必须说明 MIT 上游与二次开发范围。
- ❌ 不要把上游岗位 CRUD、基础 JWT、Compose、CI、14 篇 ADR 写成个人成果。
- ❌ 不要写吞吐/QPS 提升；三轮方向不一致。
- ❌ 不要写简历生成/编辑/模板/版本/导入导出/删除；没有。
- ❌ 不要写「支持多租户/审计/消息通知/分页」；没有。
- ⚠️ Google 登录未完成真实授权，面试可说「代码链路完成，需要配置 OAuth 凭据」，不要说「已支持 Google 登录」。
- ⚠️ UI 改版目前未提交；在提交/推送前，简历里不要写 GitHub 链接能直接看到它。

---

## 七、投递前 checklist

### P0（已完成）

- [x] 提交 UI 改版、文档、截图、测试与设计文档（`114e0e3`、`adfe5e2`）。
- [x] `main` 快进并推送 `origin/main`（`933b7d6`），本地与远端一致。
- [x] `.workbuddy/`、本地开发日记、`test-results/` 等已加入 `.gitignore`。
- [x] README 已加入截图、2026-11 改版说明、演示账号、启动步骤、已知限制与二次开发声明。
- [x] `PROJECT-BRIEF`、`resume-points`、UI 截图已纳入提交。
- [x] 已确认 GitHub 仓库 public，README 与截图可通过 raw 地址访问。
- [ ] 在 Actions 页面确认最新 CI 结果（推送后已触发）。

### P1（显著加分）

7. 做一个线上 Demo（VPS/Render/Fly.io 均可），或至少 60 秒录屏/GIF；实习面试官通常不会本地跑项目。
8. Google 按钮在未配置凭据时隐藏或明确提示，避免演示点出 Google 报错。
9. 把 CI 镜像名改到自己的 Docker Hub 命名空间；加 `npm run lint` 与非写库 E2E（可选）。
10. 增加 `.env.example`（JWT/DB/Redis/RabbitMQ/Google/OTel），不提交真实密钥。
11. 更新 `PROJECT-BRIEF`/README 的测试数与 UI 描述，避免文档与代码不一致。
12. 打 tag（`v1.0.0`），简历上的链接指向 tag 或 `main`。

### P2（有时间再做）

13. 岗位/投递/简历分页（游标），避免全量返回。
14. `ResumeStorage` 的 MinIO/S3 实现；Outbox 积压指标；登录限流。
15. 覆盖率报告/门禁；E2E 进 CI。
16. 若要投 AI 岗：另做一个真实、可评测的 LLM 功能（如结构化抽取 + 人工标注集 + 准确率/成本对比），并明确与规则匹配并存，不要改个名字就称 AI。

---

## 八、证据索引（面试前自己过一遍）

| 主题 | 代码/文档 |
|---|---|
| 上传与补偿删文件 | `job-portal-backend/src/main/java/net/jrodolfo/jobportal/service/ResumeService.java` |
| 同事务 Outbox | `.../service/ResumeUploadPersistence.java`、`.../model/ResumeOutboxEvent.java` |
| 发布器/租约/confirm | `.../messaging/ResumeOutboxPublisher.java`、`.../service/ResumeOutboxService.java`、`.../messaging/RabbitResumeMessageSender.java` |
| 消费幂等/重试/DLQ | `.../service/ResumeParseProcessor.java`、`.../config/ResumeMessagingConfig.java` |
| 文件校验/存储 | `.../service/ResumeFileValidator.java`、`.../storage/LocalResumeStorage.java` |
| 规则匹配 | `.../service/TechnicalSkillMatcher.java`、`.../service/ResumeJobMatchService.java` |
| 缓存/fail-open/指标 | `.../service/JobService.java`、`.../config/CacheConfig.java`、`.../config/FailOpenCacheErrorHandler.java`、`.../observability/JobCacheMetricsBinder.java` |
| 基准脚本/结果 | `scripts/benchmark/Measure-JobCache.ps1`（698 行）、`docs/performance/results/2026-09-13-redis-cache.md` |
| 认证/授权 | `.../config/SecurityConfig.java`、`.../config/JwtAuthFilter.java`、`.../config/OidcLoginSuccessHandler.java` |
| 迁移 | `src/main/java/db/migration/V1,V6,V7`、`src/main/resources/db/migration/V2–V5` |
| 前端工作台/改版 | `job-portal-frontend/src/components/{ApplicantDashboard,ResumePanel,AdminDashboard,AuthBrand,AuthInput,Icon}.jsx`、`src/App.css` |
| 设计与截图 | `job-portal-frontend/DESIGN.md`、`docs/ui-redesign/README.md`、`docs/ui-redesign/screenshots/` |
| 事实总览/归属 | `docs/PROJECT-BRIEF.md`、`UPSTREAM.md`、`LICENSE` |
