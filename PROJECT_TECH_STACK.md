# API Hunter - 技术栈

## 项目类型
自动化内容聚合工具（Node.js 脚本 + GitHub Actions）

## 核心技术

### 后端/脚本
- **Node.js 20+** - 运行环境
- **ES Modules** - 使用 `import/export` 语法
- **Fetch API** - HTTP 请求（内置，无需额外库）

### 依赖包
- **dotenv** (^16.4.0) - 环境变量管理

### API 集成
- **X (Twitter) API v2** - 获取推文和搜索
  - Bearer Token 认证
  - 用户推文端点
  - 搜索端点
- **Telegram Bot API** - 消息投递
- **Resend API** - 邮件投递

### 自动化
- **GitHub Actions** - 定时任务（每天 UTC 6am）
- **Cron 表达式** - `0 6 * * *`

## 项目结构

```
api-hunter/
├── scripts/                    # 核心脚本
│   ├── generate-feed.js       # 从 X 获取内容（主脚本）
│   ├── prepare-digest.js      # 打包数据给 AI
│   ├── deliver.js             # 投递摘要
│   └── package.json           # 脚本依赖
├── prompts/                    # AI 提示词（纯文本）
│   ├── summarize-api.md       # 如何总结 API
│   ├── filter-quality.md      # 如何过滤内容
│   └── digest-intro.md        # 摘要格式
├── config/                     # 配置文件
│   └── sources.json           # 追踪的账号和关键词
├── .github/workflows/          # GitHub Actions
│   └── generate-feed.yml      # 自动化配置
├── feed-apis.json             # 生成的订阅源（每日更新）
├── state-feed.json            # 去重状态
├── .gitignore
├── README.md
├── LEARN.md                   # 项目学习文档
└── package.json               # 项目配置
```

## 数据流

```
1. GitHub Actions (每天 6am UTC)
   ↓
2. generate-feed.js
   ├─ 调用 X API (获取推文)
   ├─ 过滤 API 相关内容
   ├─ 去重 (state-feed.json)
   └─ 输出 feed-apis.json
   ↓
3. Git commit & push (自动提交到 GitHub)
   ↓
4. 用户本地运行 prepare-digest.js
   ├─ 下载 feed-apis.json
   ├─ 读取用户配置
   └─ 打包给 AI
   ↓
5. AI 生成摘要 (根据 prompts/)
   ↓
6. deliver.js 投递
   └─ Telegram / Email / stdout
```

## 关键技术点

### 1. X API 认证
```javascript
const headers = {
  'Authorization': `Bearer ${process.env.X_BEARER_TOKEN}`
};
```

### 2. 去重机制
```javascript
// state-feed.json 结构
{
  "seenTweets": {
    "tweet_id_123": 1714032000000,  // 时间戳
    "tweet_id_456": 1714032000000
  }
}

// 检查是否已见
if (state.seenTweets[tweet.id]) {
  continue;  // 跳过
}
state.seenTweets[tweet.id] = Date.now();
```

### 3. 内容过滤
```javascript
// 只保留 API 相关推文
const isApiRelated = text.match(/API|tool|service|library|SDK/i);

// 只保留有一定热度的
if (tweet.likes < 5) continue;

// 必须有链接
if (urls.length === 0) continue;
```

### 4. GitHub Actions 自动化
```yaml
on:
  schedule:
    - cron: '0 6 * * *'  # 每天 UTC 6am

env:
  X_BEARER_TOKEN: ${{ secrets.X_BEARER_TOKEN }}
```

### 5. 提示词系统
- 纯文本 Markdown 文件
- 用户可自定义（~/.api-hunter/prompts/）
- 三级优先级：用户自定义 > GitHub 远程 > 本地默认

## 环境变量

### GitHub Secrets（必需）
- `X_BEARER_TOKEN` - X API Bearer Token

### 本地 .env（可选，用于投递）
- `TELEGRAM_BOT_TOKEN` - Telegram 机器人 token
- `RESEND_API_KEY` - Resend 邮件 API key

## 配置文件

### config/sources.json（仓库级别）
```json
{
  "accounts": ["levelsio", "swyx", ...],
  "keywords": ["new API", "API launch", ...]
}
```

### ~/.api-hunter/config.json（用户级别）
```json
{
  "language": "zh",
  "delivery": {
    "method": "telegram",
    "chatId": "123456789"
  }
}
```

## 运行环境

### GitHub Actions
- **OS**: Ubuntu Latest
- **Node.js**: 20.x
- **运行频率**: 每天一次
- **成本**: 免费（公共仓库）

### 本地开发
- **OS**: Windows / macOS / Linux
- **Node.js**: 20+
- **依赖**: npm install

## 与 Follow Builders 的架构对比

| 方面 | Follow Builders | API Hunter |
|------|----------------|------------|
| 语言 | Node.js | Node.js |
| 模块系统 | ES Modules | ES Modules |
| 依赖 | dotenv | dotenv |
| 自动化 | GitHub Actions | GitHub Actions |
| 数据源 | X + YouTube + Blogs | X only |
| 过滤逻辑 | 简单 | 复杂（关键词匹配） |
| 去重 | state-feed.json | state-feed.json |
| 提示词 | 5 个文件 | 3 个文件 |

## 扩展性

### 容易添加的功能
1. **新的内容源** - 添加 GitHub、Hacker News 等
2. **新的过滤规则** - 修改关键词匹配逻辑
3. **新的投递方式** - 添加 Discord、Slack 等
4. **新的提示词** - 自定义 AI 行为

### 需要重构的功能
1. **实时推送** - 需要 WebSocket 或轮询
2. **Web 界面** - 需要添加前端框架
3. **数据库** - 当前使用 JSON 文件
4. **用户系统** - 当前单用户设计

## 性能考虑

### API 速率限制
- X API: 每 15 分钟有限制
- 解决: 请求之间延迟 1 秒

### 文件大小
- feed-apis.json: 通常 < 100KB
- state-feed.json: 自动清理 7 天前的记录

### GitHub Actions 限制
- 免费额度: 2000 分钟/月
- 每次运行: < 2 分钟
- 足够每天运行

## 安全考虑

### 敏感信息
- ✅ API Token 存储在 GitHub Secrets
- ✅ 本地 .env 文件在 .gitignore 中
- ✅ 不在代码中硬编码密钥

### 数据隐私
- ✅ 只读取公开推文
- ✅ 不存储用户个人信息
- ✅ 配置文件在本地

## 部署步骤

1. **Fork 仓库**
2. **添加 GitHub Secret**: `X_BEARER_TOKEN`
3. **启用 GitHub Actions**
4. **等待第一次运行**（UTC 6am 或手动触发）
5. **本地克隆并配置**（可选）

## 维护成本

- **代码维护**: 低（架构简单）
- **运行成本**: 免费（GitHub Actions）
- **API 成本**: 免费（X API Free Tier）
- **时间成本**: 初始设置 30 分钟，之后无需维护

## 学习价值

通过这个项目，你可以学到：
1. ✅ 如何使用 X API v2
2. ✅ 如何设计三脚本架构
3. ✅ 如何使用 GitHub Actions
4. ✅ 如何实现去重机制
5. ✅ 如何设计提示词系统
6. ✅ 如何处理 API 速率限制
7. ✅ 如何管理敏感信息

## 总结

API Hunter 是一个轻量级、可扩展的内容聚合工具，完全复刻了 Follow Builders 的优秀架构，并针对 API 追踪场景做了优化。

**核心优势**：
- 🆓 完全免费运行
- 🔧 易于定制和扩展
- 🤖 AI 驱动的内容处理
- 📦 零依赖（除了 dotenv）
- 🚀 自动化运行
