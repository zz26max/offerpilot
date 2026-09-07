# OfferPilot 求职管理平台

OfferPilot 是面向求职者与招聘管理员的全栈求职管理平台。当前 v0.1.0 提供岗位浏览、投递跟踪和后台管理的完整基础流程，前端界面已完成中文化。

> 本项目基于 [jrodolfo/job-portal](https://github.com/jrodolfo/job-portal) 的 `main` 分支进行二次开发，上游引入版本与开发原则见 [UPSTREAM.md](./UPSTREAM.md)。上游代码遵循 [MIT License](./LICENSE)，原作者版权与许可证声明均予以保留。本项目只将实际新增、重构和验证过的内容作为二次开发成果。

[查看上游英文说明](./README.md)

## 当前功能

求职者可以注册并登录账号，浏览招聘中的岗位，提交、撤回或再次提交申请，并在个人看板查看投递状态和更新时间。管理员可以发布、编辑、关闭、重新开放或删除岗位，按状态审核投递记录，并启用或停用求职者账号。

当前认证方式包括邮箱密码登录、JWT 会话校验与可选的 Google OAuth2 登录。项目还提供 OpenAPI/Swagger 接口文档，以及基于 OpenTelemetry 和 Jaeger 的本地链路追踪。

## 技术栈

- 后端：Java 21、Spring Boot 3.4、Spring Security、Spring Data JPA、Flyway、MySQL 8
- 前端：React 19、Vite 6、Redux Toolkit、React Router、Axios、Bootstrap
- 测试：JUnit 5、Spring Boot Test、Vitest、Testing Library、MSW、Playwright
- 工程化：Docker Compose、OpenAPI、OpenTelemetry、Jaeger、GitHub Actions

## Windows + Docker 快速启动

需要先安装并启动 Docker Desktop。在项目根目录打开 PowerShell，执行：

```powershell
docker compose up -d --build
```

首次构建需要下载镜像和依赖，可能耗时数分钟。启动完成后可访问：

- 前端：http://localhost:5173
- 后端：http://localhost:8080
- Swagger：http://localhost:8080/swagger-ui.html
- Jaeger：http://localhost:16686

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

## v0.1.0 范围说明

本版本聚焦于建立可运行、可测试的中文产品基线，没有修改 Java 包名或数据库结构，也尚未加入 Redis、消息队列和 AI 能力。

后续计划包括：完善移动端与可访问性体验；增加 Redis 缓存、限流和验证码；通过消息队列处理异步任务；增加简历版本管理、岗位匹配分析与投递数据统计；补充完整的 Docker 端到端验证和部署说明。
