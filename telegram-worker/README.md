# Telegram 结果上报 Worker

这个 Worker 负责接收考试结果，然后转发到 Telegram。

## 需要配置的秘密

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ALLOWED_ORIGINS`（可选，默认只允许 GitHub Pages 和本地调试地址）

## 部署

在这个目录下执行：

```bash
npx wrangler deploy
```

## 设置秘密

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

如果你想额外限制来源：

```bash
npx wrangler secret put ALLOWED_ORIGINS
```

推荐值：

```text
https://winglee799-dotcom.github.io,http://localhost:8787,http://127.0.0.1:8787,null
```
