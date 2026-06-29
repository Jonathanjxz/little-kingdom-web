# Render 部署指南

本文档说明如何将 Kingdom Card Game 部署到 [Render](https://render.com) 免费层，方便朋友通过公网联机。

---

## 1. 部署前本地检查

在项目根目录 (`little-kingdom-web/`) 依次运行：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

全部通过后继续。

生产模拟启动：

```powershell
npm.cmd run start
```

验证：

- 打开 `http://localhost:3001/healthz` → 返回 `{"ok":true}`
- 打开 `http://localhost:3001` → 看到 Kingdom Card Game 前端页面
- 可以用两个浏览器标签测试创建/加入/开始游戏全流程

---

## 2. GitHub 推送

确保所有代码已提交并推送到 `Jonathanjxz/little-kingdom-web` 仓库：

```powershell
git status
git add .
git commit -m "chore: prepare render deployment"
git push
```

---

## 3. Render 页面操作

1. 登录 [dashboard.render.com](https://dashboard.render.com)
2. 点击 **New +** → **Web Service**
3. 连接 GitHub 账户，授权访问仓库
4. 选择仓库 **Jonathanjxz/little-kingdom-web**
5. 配置以下字段：

| 字段 | 值 |
|---|---|
| **Name** | `kingdom-card-game` |
| **Region** | 自动（或选择 Singapore 对亚洲延迟较低） |
| **Runtime** | Node |
| **Root Directory** | `little-kingdom-web` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Plan** | Free |
| **Health Check Path** | `/healthz` |

### 环境变量（通常自动从 render.yaml 读取，也可手动确认）

| Key | Value |
|---|---|
| `NODE_VERSION` | `20.19.0` |
| `NODE_ENV` | `production` |

> 如果 render.yaml 存在于仓库根目录且 `Root Directory` 为 `little-kingdom-web`，Render 可能不会自动检测 `little-kingdom-web/render.yaml`。此时可以手动在 Render Dashboard 中配置上述字段，或在仓库根目录也放一份 `render.yaml`。

6. 点击 **Create Web Service**

Render 将自动执行 `npm install && npm run build`，然后启动 `npm start`。

---

## 4. 部署后测试

1. Render Dashboard 显示 **Live** 后，复制 `.onrender.com` 公网 URL
2. 在浏览器打开该 URL，应看到 Kingdom Card Game 首页
3. Alice 创建房间，复制 roomId
4. 把 URL 和 roomId 发给朋友（通过聊天工具）
5. Bob 在浏览器中打开 URL，输入昵称和房间号，加入房间
6. Alice 点击「开始游戏」
7. 双方轮流出牌 / 摸牌

---

## 5. 注意事项

| 项目 | 说明 |
|---|---|
| **免费实例休眠** | Render 免费层会在无流量时休眠，首次访问需等待 30-60 秒启动。保持页面打开或定期访问可减少休眠。 |
| **内存存储** | 当前房间状态保存在服务器内存中。服务重启或休眠恢复后房间会丢失。适合 MVP 测试，不适合长期公开运营。 |
| **无数据库** | 没有持久化计分、玩家数据、历史战绩。 |
| **后续优化** | 需要数据库（SQLite/PostgreSQL）或 Redis 持久化房间和会话。 |