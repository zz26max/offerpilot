# OfferPilot 求职管理平台

OfferPilot 是面向求职者与招聘管理员的全栈求职管理平台。当前后端提供岗位浏览、投递跟踪、后台管理、简历文件管理与异步文本解析，以及 Redis 岗位查询缓存和基础可观测性，前端界面已完成中文化。

> 本项目基于 [jrodolfo/job-portal](https://github.com/jrodolfo/job-portal) 的 `main` 分支进行二次开发，上游引入版本与开发原则见 [UPSTREAM.md](./UPSTREAM.md)。上游代码遵循 [MIT License](./LICENSE)，原作者版权与许可证声明均予以保留。本项目只将实际新增、重构和验证过的内容作为二次开发成果。

[查看上游英文说明](./README.md)

## 当前功能

求职者可以注册并登录账号，浏览招聘中的岗位，提交、撤回或再次提交申请，并在个人看板查看投递状态和更新时间。求职者还可通过后端 API 上传 PDF/DOCX 简历、查看自己的简历元数据与异步提取文本，并下载原文件。管理员可以发布、编辑、关闭、重新开放或删除岗位，按状态审核投递记录，并启用或停用求职者账号。

当前认证方式包括邮箱密码登录、JWT 会话校验与可选的 Google OAuth2 登录。公开岗位列表、管理员岗位列表和岗位详情使用 Redis 缓存；缓存故障时业务读写按 fail-open 策略继续访问数据库。项目还提供 OpenAPI/Swagger 接口文档、Actuator/Prometheus 指标，以及基于 OpenTelemetry 和 Jaeger 的本地链路追踪。

## 技术栈

- 后端：Java 21、Spring Boot 3.4、Spring Security、Spring Data JPA、Flyway、MySQL 8、Redis 7、RabbitMQ 4.2、Apache Tika 3.3
- 前端：React 19、Vite 6、Redux Toolkit、React Router、Axios、Bootstrap
- 测试：JUnit 5、Spring Boot Test、Vitest、Testing Library、MSW、Playwright
- 工程化：Docker Compose、OpenAPI、Spring Boot Actuator、Prometheus、OpenTelemetry、Jaeger、GitHub Actions

## Windows + Docker 快速启动

需要先安装并启动 Docker Desktop。在项目根目录打开 PowerShell，执行：

```powershell
docker compose up -d --build
```

首次构建需要下载镜像和依赖，可能耗时数分钟。启动完成后可访问：

- 前端：http://localhost:5173
- 后端：http://localhost:8080
- Swagger：http://localhost:8080/swagger-ui.html
- 健康检查：http://localhost:8080/actuator/health
- Jaeger：http://localhost:16686
- RabbitMQ 管理界面：http://localhost:15672（账号可通过 `RABBITMQ_USER`、`RABBITMQ_PASSWORD` 覆盖）

查看服务状态或停止服务：

```powershell
docker compose ps
docker compose down
```

日常开发无需重置数据库卷。只有明确需要清空本地数据库时，才使用 `docker compose down -v`。

## 演示账号

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 求职者 | `user@local.test` | `user123` |
| 管理员 | `admin@local.test` | `admin123` |

也可以直接在登录页注册新的求职者账号。Google 登录需要额外配置 OAuth2 凭据，邮箱密码登录不受影响。

## 本地测试

后端测试使用 Maven 3.9.11 及 Java 21：

```powershell
mvn -f job-portal-backend/pom.xml test
```

前端测试与构建：

```powershell
Set-Location job-portal-frontend
npm ci
npm run lint
npm test
npm run build
```

Playwright 端到端测试需要完整服务已启动，并安装对应浏览器：

```powershell
npx playwright install chromium
npm run test:e2e
```

## 缓存指标

Actuator 只暴露 `health` 和 `prometheus`：健康检查允许匿名访问，Prometheus 端点要求 `ADMIN` 身份。可使用本地管理员账号查看指标：

```powershell
curl.exe -u admin@local.test:admin123 http://localhost:8080/actuator/prometheus
```

Redis 职位缓存启用了本进程统计。重点指标为：

- `offerpilot_cache_requests_total{cache,result}`：固定三个职位缓存的 `hit`/`miss`；
- `offerpilot_cache_fail_open_errors_total{cache,operation}`：被 fail-open 吸收的 `read`、`write`、`eviction`、`clear` 错误；
- `offerpilot_job_repository_loads_total{query="open-jobs"}`：`getOpenJobs` 缓存方法体实际执行并调用固定 Repository 查询路径的次数，不代表任意 SQL 数；
- Spring Boot 同时提供标准缓存和 HTTP/JVM 指标。

指标不会包含缓存 key、请求参数或用户信息；`cache`、`operation`、`result` 都是有限枚举。hit/miss 是单个后端进程从启动开始累计的 Redis 客户端本地统计，不是 Redis 服务端全局命中率。

## 简历文件 API

简历接口只允许 `APPLICANT` 访问，支持的文件格式为 PDF 与 DOCX，单文件上限为 5 MiB。后端会检查 PDF 文件头，或检查 DOCX 的 ZIP 包结构、必需条目、条目数量与解压扫描上限，不以客户端声明的扩展名、Content-Type 作为唯一判断依据。上传成功后返回稳定的简历 `id` 和 `QUEUED` 状态；列表与详情只返回允许用户查看的元数据、解析状态和安全错误码，不返回内部存储键、服务器路径或完整内部异常。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/resumes` | 以 `multipart/form-data` 的 `file` 字段上传简历 |
| `GET` | `/api/resumes` | 按创建时间和 id 倒序查询当前求职者的简历元数据 |
| `GET` | `/api/resumes/{id}` | 查询本人简历详情；解析完成后包含 `extractedText` |
| `GET` | `/api/resumes/{id}/content` | 下载当前求职者本人的简历；不存在或不属于本人均返回 404 |

本地直接运行时，文件默认写入 `./data/resumes`。该目录保存用户上传内容，已从 Git 和 Docker 构建上下文中排除，不应手动提交。可使用 `RESUME_STORAGE_ROOT` 修改目录，使用 `RESUME_MAX_FILE_SIZE` 和 `RESUME_MAX_REQUEST_SIZE` 调整 Web 层上传限制；业务层仍执行 5 MiB 上限校验。Docker Compose 将目录设置为 `/app/data/resumes`，并挂载 `resume-data` 命名卷，因此重建 backend 容器不会丢失文件。

当前文件实现仍是单实例本地存储：多个后端副本不能自动共享文件，也不提供对象存储级别的高可用、跨节点一致性或备份能力。文件操作位于可替换的存储接口之后，后续可接入 MinIO 等共享对象存储。本阶段尚未提供简历删除或前端简历页面。

### 异步解析与可靠性边界

上传流程先安全写入文件，再在同一数据库事务中保存 `Resume` 与 Outbox 事件；事务或提交失败时会补偿删除刚写入的文件。Outbox 调度器以短租约、小批量领取待发布事件，并使用 RabbitMQ publisher confirm 与 mandatory return 判定投递结果。只有消息被确认且未退回时才标记为已发布；RabbitMQ 暂时不可用不会阻止后端启动，事件会保留并按有上限的指数退避重试。这解决了“数据库已写入但消息丢失”的双写窗口，但允许“消息已送达、发布状态尚未写回”造成重复投递。

RabbitMQ 主队列、交换机和消息均为持久化配置。消费者采用至少一次语义，并在数据库中锁定对应简历行：已成功的重复事件直接确认，不会再次提取。真实解析失败会单独持久化次数与安全错误码，默认最多 3 次，重试耗尽后状态为 `FAILED`，消息拒绝并由 RabbitMQ 路由到最终 DLQ；不存在、版本不兼容等陈旧事件不会无限重排。已发布 Outbox 行暂时保留作审计。

文本提取使用 Apache Tika 3.3.2，仅根据数据库中已验证的规范 PDF/DOCX MIME 选择解析器。PDF 禁用 OCR，嵌入附件不递归解析；输出统一换行、去除首尾空白，并硬限制为最多 100,000 字符。当前解析发生在后端 JVM 内：HTTP 请求已经与解析工作解耦，也有输入文件与输出长度限制，但这不是恶意文档 CPU/内存的硬进程隔离；生产环境应进一步将解析器放入具备资源配额的独立工作进程或容器。

常用配置如下，时长使用 Spring `Duration` 格式；数值还会经过应用边界校验：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `RABBITMQ_HOST` / `RABBITMQ_PORT` | `localhost` / `5672` | RabbitMQ 连接地址 |
| `RABBITMQ_USER` / `RABBITMQ_PASSWORD` | 本地开发值 | RabbitMQ 凭据；生产环境必须覆盖且不要写入日志 |
| `RESUME_OUTBOX_POLL_INTERVAL` / `RESUME_OUTBOX_BATCH_SIZE` | `1s` / `20` | Outbox 扫描周期与批量 |
| `RESUME_OUTBOX_CLAIM_LEASE` | `30s` | 多实例发布领取租约 |
| `RESUME_OUTBOX_INITIAL_BACKOFF` / `RESUME_OUTBOX_MAX_BACKOFF` | `1s` / `1m` | 发布失败退避范围 |
| `RESUME_PARSE_MAX_ATTEMPTS` | `3` | 消费解析总尝试次数 |
| `RESUME_PARSE_INITIAL_BACKOFF` / `RESUME_PARSE_MAX_BACKOFF` | `500ms` / `5s` | 消费重试退避范围 |
| `RESUME_TEXT_MAX_CHARACTERS` | `100000` | 提取文本上限；不能超过硬上限 100,000 |

## 缓存开关对照基准

完整环境启动后，可运行 Windows PowerShell 脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark\Measure-JobCache.ps1 `
  -Rounds 3 -RequestsPerRound 200 -Concurrency 20 -WarmupRequests 10 `
  -FixtureJobCount 100 -MinimumJobCount 100
```

脚本可通过现有管理员 API 创建仅属于本次唯一 marker 的临时 OPEN 职位，在同一个 backend 镜像上依次重建 cache-disabled 与 cache-enabled 场景，每个场景执行相同预热及多轮请求，记录 QPS、P50/P95/P99 和预热后的 Repository 回源次数，并校验所有响应的职位数量与 SHA-256 完全一致。Redis 场景只删除公开职位列表对应的一个已知键；脚本结束或失败时都会恢复进入前 backend 的实际缓存模式，只按捕获的具体 ID 清理本次 fixture，并验证原始职位 count/SHA 已恢复。

正式记录结果时必须保持 `SPRING_JPA_SHOW_SQL=false`；示例中的 100 不是通用标准。输出百分比只适用于本次同机、本地、特定数据量和参数的受控实验，不代表生产容量或 SLA。强制终止进程仍可能绕过 `finally`，人工残留检查、参数、凭据处理、任务清理与恢复边界详见 [职位缓存对照基准说明](./docs/performance/README.zh-CN.md)。

## v0.2.0 范围说明

本版本在既有中文产品基线上加入 Redis 职位查询缓存、缓存故障 fail-open、缓存命中/失败指标、受保护的 Prometheus 端点和可复现的 cold/warm 基准脚本。没有修改 Java 包名或数据库结构。

本版本不包含 AI 匹配、简历删除、MinIO、限流、验证码或跨实例聚合缓存统计。后续计划包括：完善移动端与可访问性体验；增加限流和验证码；将 Tika 解析隔离为受资源配额约束的独立工作进程；增加简历版本管理、岗位匹配分析与投递数据统计；补充完整的生产容量验证和部署说明。
