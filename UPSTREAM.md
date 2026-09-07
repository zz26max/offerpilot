# 上游来源

- 上游仓库：https://github.com/jrodolfo/job-portal.git
- 引入分支：`main`
- 引入提交：`0d3e98b98e82bc9e6055e49566635be505e3f2fa`
- 本地快照提交：`559928fd4ceb63d6ca91235f170817f78cc22796`
- 许可证：MIT License（原始许可证与版权信息见 [LICENSE](./LICENSE)）

由于引入时 GitHub 的 Git 传输连接持续重置，本地基线通过 GitHub 官方 codeload 归档建立，并将原仓库配置为 `upstream` 远程。本地提交用于固定该代码快照，不等同于上游提交历史。

## 二次开发原则

本项目在保留上游许可证和版权声明的前提下进行二次开发。后续文档、演示和简历只描述实际新增、重构或验证过的工作，不将上游已有功能表述为原创实现；涉及上游代码的分发继续遵守 MIT License。

## 引入时基线验证（2026-09-07）

- 后端：Maven 3.9.11 / Java 21.0.11，`mvn -f job-portal-backend/pom.xml test` 通过（94 项测试）。
- 前端：Node.js 24.17.0 / npm 11.13.0，`npm test` 通过（13 个测试文件、75 项测试），`npm run build` 通过。
- 依赖安装：`npm ci` 成功，但 npm 审计报告 22 个上游依赖漏洞（1 low、3 moderate、16 high、2 critical），需在后续升级阶段单独评估，未自动修复以免改变基线。
- 未运行 Docker 全栈与 Playwright 端到端测试：本机 Docker daemon 未启动，当前 WSL 环境也没有可用的 `/bin/bash`。
