# 岗位缓存基准

`scripts/benchmark/Measure-JobCache.ps1` 面向 Windows PowerShell，可复现地测量公开接口 `GET /api/jobs` 的一次冷缓存延迟，以及预热后的并发吞吐和 P50/P95/P99 延迟。

先启动完整 Docker Compose 环境，再从项目根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark\Measure-JobCache.ps1 `
  -Requests 200 -Concurrency 20 -WarmupRequests 10
```

脚本会执行以下有限操作：

1. 请求公开的 `/actuator/health` 确认后端可用。
2. 通过 `docker compose exec` 只删除 Redis 中的已知键 `offerpilot::jobs-open::all`。
3. 立即请求一次 `/api/jobs`，记录冷缓存延迟；该请求同时重新填充缓存。
4. 额外预热后并发请求，计算吞吐及延迟分位数。
5. 在参数 `-OutputDirectory` 指定的目录写入 JSON 和文本结果；默认写入系统临时目录下的 `offerpilot-benchmark`。

如果修改了 `CACHE_KEY_PREFIX`，必须通过 `-CacheKey` 传入与运行环境一致的完整 Redis 键。脚本无法确认数据库页缓存、JIT、网络或其他机器负载完全一致，因此结果适合在同一环境中做重复观察，不代表生产容量。它只报告 cold/warm 数据，不提供或推断“禁用缓存”的对照，也不会执行 `FLUSHDB`/`FLUSHALL`。

脚本默认绕过系统 HTTP 代理，避免本机代理污染 localhost 结果；只有确实需要通过代理访问 `-BaseUrl` 时才传入 `-UseProxy`。
