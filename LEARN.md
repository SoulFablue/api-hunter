# API Hunter 项目文档

## 项目概述

API Hunter 是一个自动化工具，每天追踪 X (Twitter) 上开发者分享的 API、工具和服务，并生成结构化摘要。

## 技术架构

### 核心理念：复刻 Follow Builders

这个项目完全复刻了 Follow Builders 的架构模式：
1. **中央获取** - 在 GitHub Actions 上集中获取内容
2. **三脚本分离** - generate（获取）、prepare（准备）、deliver（投递）
3. **提示词驱动** - 使用纯文本提示词控制 AI 行为
4. **去重机制** - 使用状态文件避免重复内容

### 与 Follow Builders 的区别

| 方面 | Follow Builders | API Hunter |
|------|----------------|------------|
| 内容源 | 固定 25 个账号 | 账号 + 关键词搜索 |
| 内容类型 | 推文 + 播客 + 博客 | 只有推文 |
| 过滤逻辑 | 简单（所有推文） | 复杂（只保留 API 相关） |
| 数据提取 | 原始推文 | 提取 API 信息（名称、链接、功能） |

## 文件结构

```
api-hunter/
├── scripts/
│   ├── generate-feed.js    # 核心：从 X 获取内容
│   ├── prepare-digest.js   # 打包数据给 AI
│   ├── deliver.js          # 投递摘要
│   └── package.json        # 依赖配置
├── prompts/
│   ├── summarize-api.md    # AI 如何总结 API
│   ├── filter-quality.md   # AI 如何过滤内容
│   └── digest-intro.md     # 摘要格式模板
├── config/
│   └── sources.json        # 追踪的账号和关键词
├── .github/workflows/
│   └── generate-feed.yml   # GitHub Actions 配置
├── .gitignore
├── README.md
├── package.json
├── feed-apis.json          # 生成的订阅源（每日更新）
└── state-feed.json         # 去重状态（记录已见推文）
```

## 核心脚本详解

### 1. generate-feed.js（获取脚本）

**功能**：
- 从 X API 获取特定账号的推文
- 搜索包含 API 关键词的推文
- 过滤：只保留提到 API/工具的推文
- 去重：使用 state-feed.json 避免重复
- 输出：feed-apis.json

**关键技术点**：

```javascript
// 1. 获取用户推文
async function fetchUserTweets(handle, cutoffTime, state) {
  // 先获取用户 ID
  const userData = await fetchFromX('/users/by/username/' + handle);
  
  // 再获取推文
  const tweetsData = await fetchFromX(`/users/${user.id}/tweets`, {
    'exclude': 'retweets,replies',  // 排除转发和回复
    'start_time': cutoffTime.toISOString()  // 只要最近 24 小时
  });
  
  // 过滤：只保留 API 相关
  const apiTweets = tweets.filter(t => 
    t.text.match(/API|tool|service|library|SDK/i)
  );
}

// 2. 搜索关键词
async function searchKeyword(keyword, cutoffTime, state) {
  const data = await fetchFromX('/tweets/search/recent', {
    'query': `"${keyword}" -is:retweet -is:reply has:links`,
    'max_results': 20
  });
  
  // 过滤低质量内容
  const filtered = results.filter(t => 
    t.likes > 5 &&  // 至少 5 个赞
    t.urls.length > 0  // 必须有链接
  );
}

// 3. 去重机制
if (state.seenTweets[tweet.id]) {
  continue;  // 跳过已见过的
}
state.seenTweets[tweet.id] = Date.now();
```

**输出格式**（feed-apis.json）：
```json
{
  "generatedAt": "2026-04-24T06:00:00Z",
  "lookbackHours": 24,
  "accounts": [
    {
      "source": "account",
      "name": "Pieter Levels",
      "handle": "levelsio",
      "tweets": [
        {
          "id": "123",
          "text": "推文内容",
          "url": "https://x.com/levelsio/status/123",
          "urls": ["https://api-link.com"],
          "likes": 50
        }
      ]
    }
  ],
  "searchResults": [
    {
      "id": "456",
      "text": "推文内容",
      "author": { "name": "...", "handle": "..." }
    }
  ]
}
```

### 2. prepare-digest.js（准备脚本）

**功能**：
- 下载 feed-apis.json（从 GitHub）
- 读取用户配置（语言、投递方式）
- 加载提示词文件
- 打包成 JSON 输出给 AI

**关键技术点**：

```javascript
// 提示词加载优先级
// 1. 用户自定义（~/.api-hunter/prompts/）
if (existsSync(userPath)) {
  prompts[key] = await readFile(userPath, 'utf-8');
}
// 2. GitHub 远程（最新版本）
else {
  const remote = await fetchText(`${PROMPTS_BASE}/${filename}`);
  if (remote) prompts[key] = remote;
}
// 3. 本地默认（离线备份）
else if (existsSync(localPath)) {
  prompts[key] = await readFile(localPath, 'utf-8');
}
```

**输出格式**：
```json
{
  "status": "ok",
  "config": {
    "language": "zh",
    "delivery": { "method": "telegram" }
  },
  "feed": { /* feed-apis.json 的内容 */ },
  "prompts": {
    "summarize_api": "提示词内容...",
    "digest_intro": "提示词内容..."
  }
}
```

### 3. deliver.js（投递脚本）

**功能**：
- 接收摘要文本（从 stdin 或参数）
- 根据配置投递到 Telegram/邮件/终端

**关键技术点**：

```javascript
// Telegram 分块发送（限制 4096 字符）
async function sendTelegram(text, botToken, chatId) {
  const MAX_LEN = 4000;
  const chunks = [];
  
  // 在换行符处分割
  while (remaining.length > 0) {
    let splitAt = remaining.lastIndexOf('\n', MAX_LEN);
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  
  // 逐块发送
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      body: JSON.stringify({ chat_id: chatId, text: chunk })
    });
  }
}
```

## 提示词系统

### summarize-api.md（总结 API）

告诉 AI 如何将推文转换为结构化的 API 介绍：

```markdown
**[API 名称]** - 一句话描述

- **用途**: 解决什么问题
- **特点**: 免费/付费、主要功能
- **推荐理由**: 为什么值得关注
- **分享者**: @用户名
- **链接**: [官网]
```

### filter-quality.md（过滤质量）

告诉 AI 如何判断推文是否值得包含：

**保留**：
- 真实的产品发布（有官网链接）
- 真实的使用体验
- 有价值的推荐（点赞 > 5）

**过滤**：
- 纯广告（"限时优惠"）
- 低质量内容（只有链接）
- 垃圾信息

### digest-intro.md（摘要格式）

定义最终摘要的结构：

```markdown
# API Hunter 每日摘要

## 🔥 开发者推荐
（按账号分组）

## 🔍 热门发现
（搜索结果）

## 📊 今日统计
```

## GitHub Actions 配置

**.github/workflows/generate-feed.yml**：

```yaml
on:
  schedule:
    - cron: '0 6 * * *'  # 每天 UTC 6am

jobs:
  generate:
    steps:
      - name: Generate feed
        env:
          X_BEARER_TOKEN: ${{ secrets.X_BEARER_TOKEN }}
        run: cd scripts && node generate-feed.js
      
      - name: Commit and push
        run: |
          git add feed-apis.json state-feed.json
          git commit -m "chore: update API feed"
          git push
```

## 使用流程

### 自动化流程（GitHub Actions）

1. **每天 UTC 6am**：GitHub Actions 触发
2. **generate-feed.js** 运行：
   - 从 X API 获取推文
   - 过滤 API 相关内容
   - 去重
   - 生成 feed-apis.json
3. **提交到 GitHub**：feed-apis.json 和 state-feed.json 更新

### 本地使用流程

1. **下载订阅源**：
```bash
node prepare-digest.js > digest-data.json
```

2. **AI 生成摘要**（手动或通过 AI 代理）：
```bash
# 读取 digest-data.json
# 按照 prompts 中的指示生成摘要
# 输出摘要文本
```

3. **投递摘要**：
```bash
echo "摘要文本" | node deliver.js
```

## 配置说明

### config/sources.json（追踪配置）

```json
{
  "accounts": [
    { "handle": "levelsio", "name": "Pieter Levels" }
  ],
  "keywords": [
    "new API",
    "API launch"
  ]
}
```

### ~/.api-hunter/config.json（用户配置）

```json
{
  "language": "zh",
  "frequency": "daily",
  "delivery": {
    "method": "telegram",
    "chatId": "123456789"
  }
}
```

### ~/.api-hunter/.env（密钥）

```
TELEGRAM_BOT_TOKEN=你的token
RESEND_API_KEY=你的key（如果用邮件）
```

## 技术决策

### 决策 1：为什么用关键词搜索？

**原因**：只追踪固定账号会漏掉很多好 API。关键词搜索可以发现新的分享者。

**权衡**：搜索结果质量参差不齐，需要更复杂的过滤逻辑。

### 决策 2：为什么只保留 API 相关推文？

**原因**：开发者账号会发很多非 API 内容（生活、观点等）。过滤可以提高信噪比。

**实现**：检查推文是否包含 "API"、"tool"、"service" 等关键词。

### 决策 3：为什么需要 filter-quality.md？

**原因**：搜索结果包含大量广告和低质量内容。需要 AI 帮助判断。

**实现**：AI 读取提示词，对每条推文输出 `{keep: true/false, reason: "..."}`。

## 潜在问题和解决方案

### 问题 1：X API 速率限制

**现象**：请求过多会被限制

**解决**：
- 每个请求之间延迟 1 秒
- 限制每个账号最多 3 条推文
- 限制搜索结果最多 20 条

### 问题 2：推文信息不完整

**现象**：有些推文只有链接，没有描述

**解决**：
- 在 summarize-api.md 中处理这种情况
- 输出"需要访问链接了解详情"

### 问题 3：重复内容

**现象**：同一个 API 被多人分享

**解决**：
- state-feed.json 记录推文 ID
- 搜索结果去重（检查 ID）

## 下一步改进

1. **添加 AI 过滤**：在 generate-feed.js 中调用 AI 判断质量
2. **提取 API 元数据**：自动访问链接，提取 API 名称、功能
3. **分类标签**：给 API 打标签（认证、数据库、支付等）
4. **趋势分析**：统计哪些 API 最热门
5. **Web 界面**：创建一个网页展示所有 API

## 总结

API Hunter 成功复刻了 Follow Builders 的架构，并针对 API 追踪场景做了优化：
- ✅ 中央获取（GitHub Actions）
- ✅ 三脚本分离（generate、prepare、deliver）
- ✅ 提示词驱动（AI 可定制）
- ✅ 去重机制（state-feed.json）
- ✅ 关键词搜索（发现新内容）
- ✅ 智能过滤（只保留 API 相关）

这个架构可以轻松扩展到其他场景：
- 追踪开源项目发布
- 追踪技术文章
- 追踪招聘信息
- 追踪任何你感兴趣的内容
