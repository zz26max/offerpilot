# Redis 职位列表缓存对照测试（2026-09-13）

## 结论

在本机 Docker 环境、101 条公开职位、并发 20、每个缓存场景 1,000 次计时请求的三轮对照中，启用 Redis 后 P95 延迟均低于禁用缓存时，降幅为 13.10%～26.39%；计时阶段的 Repository 回源次数每轮均由 1,000 次降为 0。

吞吐、P50 和 P99 在三轮中的方向不完全一致，容易受本机调度和短时抖动影响，不作为简历量化结论。

## 测试方法

- 基线版本：`v0.2.0`；对照工具链起点：`709d59d`
- 环境：Windows、Docker Desktop、Java 21、Spring Boot 3.4.4、MySQL 8.0、Redis 7.2
- 接口：`GET /api/jobs`
- 数据集：原有 1 条职位，脚本通过管理 API 临时创建 100 条 OPEN 职位，共 101 条
- 参数：5 轮 × 200 请求，20 并发；每个场景预热 50 次
- 场景：`SPRING_CACHE_TYPE=none` 与 `SPRING_CACHE_TYPE=redis`
- 公平性控制：两个场景返回数量和响应 SHA-256 必须一致；关闭 Hibernate SQL 输出，避免无缓存场景承担额外日志开销
- 数据安全：脚本只记录本次创建接口返回的精确 ID，最终逐条删除并校验公开响应数量和 SHA-256 恢复原值

运行命令：

```powershell
.\scripts\benchmark\Measure-JobCache.ps1 `
  -Rounds 5 `
  -RequestsPerRound 200 `
  -Concurrency 20 `
  -WarmupRequests 50 `
  -FixtureJobCount 100 `
  -FixtureDescriptionLength 256 `
  -MinimumJobCount 100
```

## 三轮结果

| 运行 | 无缓存吞吐 (req/s) | Redis 吞吐 (req/s) | 无缓存 P95 (ms) | Redis P95 (ms) | P95 变化 | Repository 回源（无缓存 → Redis） |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 224.37 | 260.01 | 120.15 | 93.48 | -22.20% | 1,000 → 0 |
| 2 | 233.48 | 231.02 | 124.62 | 108.29 | -13.10% | 1,000 → 0 |
| 3 | 230.34 | 260.73 | 123.57 | 90.96 | -26.39% | 1,000 → 0 |

三轮 P95 均值由 122.78 ms 降至 97.58 ms，平均降幅 20.56%。这是受控的本地对照结果，不代表生产容量或线上 SLA。

## 正确性与清理校验

三轮均满足：

- 无缓存与 Redis 场景返回 101 条职位，响应 SHA-256 相同
- 无缓存场景计时阶段 Repository 回源 1,000 次，Redis 热缓存场景为 0 次
- 创建的 100 条临时职位全部删除
- 清理后公开职位数量恢复为 1，响应 SHA-256 恢复为运行前值
- 后端恢复为 `SPRING_CACHE_TYPE=redis`，运行结束时健康检查通过

原始 JSON 保存在执行机临时目录，文件校验值如下：

| 文件 | SHA-256 |
| --- | --- |
| `job-cache-comparison-20260913-012357Z.json` | `41ffc22c7abeaea1c3ffcb2084f7282741c2bc6b0b98f6d593822ce2403261ff` |
| `job-cache-comparison-20260913-012534Z.json` | `58a6e546f28a433f1c2471a754c06c716c70cbee1918477b021199eefe222a95` |
| `job-cache-comparison-20260913-012652Z.json` | `1d73a0b4a9f75089659ba0dfe3c94c73d4a659fc40f7d12ce5c22ce49b3f2e98` |

## 简历表述建议

> 为职位列表热点查询引入 Redis 缓存与 Micrometer 回源指标，并编写可切换缓存、自动构造及回收测试数据的 PowerShell 对照工具；在本地 101 条职位、并发 20、每场景 1,000 次请求的三轮测试中，P95 延迟稳定下降 13%～26%，Repository 回源由每次请求一次降至 0。

面试时应主动说明这是本地受控对照测试；不要把吞吐提升写成稳定结论，也不要外推为生产性能。
