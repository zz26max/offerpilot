# 职位缓存对照基准

`scripts/benchmark/Measure-JobCache.ps1` 面向 Windows PowerShell，在同一台机器、同一份数据和同一个后端镜像上依次测量 `spring.cache.type=none` 与 `spring.cache.type=redis`。每个场景包含相同的预热请求和至少两轮并发请求，输出各轮及合计的吞吐、P50/P95/P99。

先启动完整 Docker Compose 环境，再从项目根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark\Measure-JobCache.ps1 `
  -Rounds 3 -RequestsPerRound 200 -Concurrency 20 -WarmupRequests 10 `
  -FixtureJobCount 100 -MinimumJobCount 100
```

默认 `-FixtureJobCount 0` 不创建数据，`-MinimumJobCount 1` 只为本地冒烟兼容。正式示例通过现有管理员 API 临时创建 100 个 OPEN 职位，并用最低数量门槛防止误用微小数据集；100 不是通用性能标准。默认临时职位描述长度为 256 字符，可用 `-FixtureDescriptionLength` 在 96–2000 之间调整。

正式测量必须保持 `SPRING_JPA_SHOW_SQL=false`（应用及 Compose 默认均为 false），否则逐条 SQL 明细输出会显著污染 cache-disabled 场景。测量期间也不要进行其他职位写操作。

脚本默认先构建一次 backend 镜像，再按以下顺序仅强制重建 backend 容器：

1. 先保存原始公开职位列表的数量与 SHA-256。启用 fixture 时，通过 ADMIN Basic 调用现有 `POST /api/jobs` 创建带唯一 run marker 的职位，并逐个记录 API 返回的 ID；不修改原有职位。
2. `SPRING_CACHE_TYPE=none`：执行预热，在预热完成后记录 Prometheus 回源 counter 基线，再执行多轮请求。
3. `SPRING_CACHE_TYPE=redis`：只删除 Redis 已知键 `offerpilot::jobs-open::all`，再做完全相同的测量。
4. 对每个响应检查职位数量与原始响应体 SHA-256；任意请求发生变化，或两个场景不一致，立即判定本次测量无效。
5. 首次变更前读取运行中 backend 的实际 `SPRING_CACHE_TYPE`；旧版容器尚未声明该变量、或没有运行中容器时，安全回退到 Compose 渲染配置。
6. 无论 fixture 创建中途、测量还是凭据校验失败，`finally` 都先恢复 backend 原缓存模式，再仅按本次捕获的具体 ID 调用 `DELETE /api/jobs/{id}`，最后验证公开列表的原始数量和 SHA-256 完全恢复；进程环境变量也精确保留原本是“未设置”还是具体值。

脚本不会执行 `FLUSHDB`/`FLUSHALL`，也不会按 marker 或宽泛前缀批量删除数据。并发请求异常时会取消并回收尚未完成的 HTTP task。它默认绕过系统 HTTP 代理，避免 localhost 请求被代理成 502；只有目标确实需要代理时才传 `-UseProxy`。

强制结束 PowerShell 进程、机器重启或 Docker 服务中断可能绕过或阻止 `finally`。脚本会在创建前输出本次唯一 run marker；遇到这类非正常终止时，可由管理员读取 `GET /api/jobs/admin`，人工筛选标题或描述中完全匹配该 marker 的记录，核对其 ID 后逐条删除。不要仅凭 `offerpilot-benchmark-` 前缀删除。

## 结果与指标

默认输出到系统临时目录的 `offerpilot-benchmark`，同时生成机器可读 JSON 与人可读文本。可以通过 `-OutputDirectory` 修改位置。输出包含：

- 每场景、每轮与总计的请求数、QPS、P50/P95/P99、最小和最大延迟；
- 响应职位数量与 SHA-256 一致性依据；
- 数据集原始数量、实际创建的 fixture 数量、测量总数、本次 marker、捕获的具体 ID 以及清理恢复校验；
- `offerpilot_job_repository_loads_total{query="open-jobs"}` 的前后差值，其中 measured delta 不包含预热，warmup delta 单独报告；
- cache-enabled 相对 cache-disabled 的本次受控实验百分比差异；
- backend 最终恢复的 cache type 与健康状态。

Repository load counter 只表示 `getOpenJobs` 缓存方法体实际执行并调用固定 Repository 查询路径的次数，不是 Hibernate、数据库或整个应用的任意 SQL 数量。管理员用户名和密码只用于 fixture CRUD 与读取受保护的 Prometheus 端点，不写入 JSON 或文本结果；可通过 `-AdminUsername`、`-AdminPassword` 覆盖本地演示账号。

如果镜像已提前构建，可传 `-SkipBuild`。如果修改了 `CACHE_KEY_PREFIX`，必须用 `-CacheKey` 提供与运行环境一致的完整键。

## 解释边界

百分比只描述这一次同机、本地、特定数据量与并发参数的受控实验。容器重启顺序、JIT、数据库页缓存、网络、Docker Desktop 和其他机器负载仍会影响结果；它不能外推为生产容量、SLA 或普遍性能提升。建议重复执行并保留原始 JSON，而不是只引用单次百分比。

仓库开发阶段用 1 条职位数据完成的运行只证明脚本、指标、响应一致性和恢复流程可工作，不能作为简历中的缓存性能结论。
