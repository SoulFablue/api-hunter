#!/usr/bin/env node

// ============================================================================
// API Hunter — Generate Feed
// ============================================================================
// 从 X (Twitter) 获取关于 API 的推文，生成每日订阅源
//
// 功能：
// 1. 追踪特定开发者账号的推文
// 2. 搜索包含 API 相关关键词的推文
// 3. 过滤低质量内容
// 4. 去重（避免重复推送）
// 5. 输出 feed-apis.json
//
// 使用: node generate-feed.js
// 环境变量: X_BEARER_TOKEN (必需)
// ============================================================================

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

// -- 配置 ---------------------------------------------------------------

const X_API_BASE = 'https://api.x.com/2';
const SCRIPT_DIR = new URL('.', import.meta.url).pathname.slice(1); // 移除开头的 /
const STATE_PATH = join(SCRIPT_DIR, '..', 'state-feed.json');
const SOURCES_PATH = join(SCRIPT_DIR, '..', 'config', 'sources.json');
const OUTPUT_PATH = join(SCRIPT_DIR, '..', 'feed-apis.json');

const LOOKBACK_HOURS = 24; // 获取过去 24 小时的推文
const MAX_TWEETS_PER_USER = 3; // 每个用户最多保留 3 条推文
const MAX_SEARCH_RESULTS = 20; // 每个关键词最多 20 条结果

// -- 状态管理（去重）----------------------------------------------------

async function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { seenTweets: {} };
  }
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf-8'));
  } catch {
    return { seenTweets: {} };
  }
}

async function saveState(state) {
  // 清理 7 天前的记录
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, ts] of Object.entries(state.seenTweets)) {
    if (ts < cutoff) delete state.seenTweets[id];
  }
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

// -- 加载配置 -----------------------------------------------------------

async function loadSources() {
  if (!existsSync(SOURCES_PATH)) {
    // 如果没有配置文件，使用默认配置
    return {
      accounts: [
        { handle: 'levelsio', name: 'Pieter Levels' },
        { handle: 'swyx', name: 'Swyx' },
        { handle: 'rauchg', name: 'Guillermo Rauch' },
        { handle: 't3dotgg', name: 'Theo' },
        { handle: 'jaredpalmer', name: 'Jared Palmer' }
      ],
      keywords: [
        'new API',
        'API launch',
        'free API',
        'developer tools',
        'open source API'
      ]
    };
  }
  return JSON.parse(await readFile(SOURCES_PATH, 'utf-8'));
}

// -- X API 调用 ---------------------------------------------------------

async function fetchFromX(endpoint, params = {}) {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error('X_BEARER_TOKEN 环境变量未设置');
  }

  const url = new URL(`${X_API_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'User-Agent': 'APIHunter/1.0'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`X API 错误 ${response.status}: ${text}`);
  }

  return response.json();
}

// -- 获取用户推文 -------------------------------------------------------

async function fetchUserTweets(handle, cutoffTime, state) {
  console.error(`  获取 @${handle} 的推文...`);

  // 1. 先获取用户 ID
  const userData = await fetchFromX('/users/by/username/' + handle, {
    'user.fields': 'name,description'
  });

  if (!userData.data) {
    console.error(`    用户 @${handle} 不存在`);
    return null;
  }

  const user = userData.data;

  // 2. 获取用户的推文
  const tweetsData = await fetchFromX(`/users/${user.id}/tweets`, {
    'max_results': 10,
    'tweet.fields': 'created_at,public_metrics,entities',
    'exclude': 'retweets,replies',
    'start_time': cutoffTime.toISOString()
  });

  if (!tweetsData.data || tweetsData.data.length === 0) {
    console.error(`    没有新推文`);
    return null;
  }

  // 3. 过滤：只保留提到 API/工具的推文
  const apiTweets = [];
  for (const tweet of tweetsData.data) {
    // 跳过已见过的
    if (state.seenTweets[tweet.id]) continue;

    // 检查是否提到 API 相关内容
    const text = tweet.text.toLowerCase();
    const isApiRelated =
      text.includes('api') ||
      text.includes('tool') ||
      text.includes('service') ||
      text.includes('library') ||
      text.includes('sdk') ||
      text.includes('framework');

    if (!isApiRelated) continue;

    // 提取 URL
    const urls = tweet.entities?.urls?.map(u => u.expanded_url || u.url) || [];

    apiTweets.push({
      id: tweet.id,
      text: tweet.text,
      createdAt: tweet.created_at,
      url: `https://x.com/${handle}/status/${tweet.id}`,
      urls: urls,
      likes: tweet.public_metrics?.like_count || 0,
      retweets: tweet.public_metrics?.retweet_count || 0
    });

    // 标记为已见
    state.seenTweets[tweet.id] = Date.now();

    if (apiTweets.length >= MAX_TWEETS_PER_USER) break;
  }

  if (apiTweets.length === 0) {
    console.error(`    没有 API 相关推文`);
    return null;
  }

  console.error(`    找到 ${apiTweets.length} 条 API 相关推文`);

  return {
    source: 'account',
    name: user.name,
    handle: handle,
    bio: user.description || '',
    tweets: apiTweets
  };
}

// -- 搜索关键词 ---------------------------------------------------------

async function searchKeyword(keyword, cutoffTime, state) {
  console.error(`  搜索关键词: "${keyword}"...`);

  const data = await fetchFromX('/tweets/search/recent', {
    'query': `"${keyword}" -is:retweet -is:reply has:links`,
    'max_results': MAX_SEARCH_RESULTS,
    'tweet.fields': 'created_at,public_metrics,author_id,entities',
    'expansions': 'author_id',
    'user.fields': 'name,username',
    'start_time': cutoffTime.toISOString()
  });

  if (!data.data || data.data.length === 0) {
    console.error(`    没有结果`);
    return [];
  }

  // 构建用户映射
  const users = {};
  if (data.includes?.users) {
    for (const user of data.includes.users) {
      users[user.id] = user;
    }
  }

  const results = [];
  for (const tweet of data.data) {
    // 跳过已见过的
    if (state.seenTweets[tweet.id]) continue;

    // 过滤低质量内容
    if (tweet.public_metrics.like_count < 5) continue; // 至少 5 个赞

    const author = users[tweet.author_id];
    if (!author) continue;

    // 提取 URL
    const urls = tweet.entities?.urls?.map(u => u.expanded_url || u.url) || [];
    if (urls.length === 0) continue; // 必须有链接

    results.push({
      id: tweet.id,
      text: tweet.text,
      createdAt: tweet.created_at,
      url: `https://x.com/${author.username}/status/${tweet.id}`,
      urls: urls,
      likes: tweet.public_metrics.like_count,
      retweets: tweet.public_metrics.retweet_count,
      author: {
        name: author.name,
        handle: author.username
      }
    });

    // 标记为已见
    state.seenTweets[tweet.id] = Date.now();
  }

  console.error(`    找到 ${results.length} 条有效结果`);

  return results;
}

// -- 主函数 -------------------------------------------------------------

async function main() {
  console.error('API Hunter - 生成订阅源\n');

  const errors = [];
  const state = await loadState();
  const sources = await loadSources();
  const cutoffTime = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);

  console.error(`时间范围: ${cutoffTime.toISOString()} 至今\n`);

  // 1. 获取特定账号的推文
  console.error('1. 获取开发者账号推文...');
  const accountResults = [];
  for (const account of sources.accounts) {
    try {
      const result = await fetchUserTweets(account.handle, cutoffTime, state);
      if (result) accountResults.push(result);
      // 避免触发速率限制
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      errors.push(`账号 @${account.handle}: ${err.message}`);
      console.error(`    错误: ${err.message}`);
    }
  }

  // 2. 搜索关键词
  console.error('\n2. 搜索 API 关键词...');
  const searchResults = [];
  for (const keyword of sources.keywords) {
    try {
      const results = await searchKeyword(keyword, cutoffTime, state);
      searchResults.push(...results);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      errors.push(`关键词 "${keyword}": ${err.message}`);
      console.error(`    错误: ${err.message}`);
    }
  }

  // 3. 去重搜索结果（可能有重复）
  const uniqueSearchResults = [];
  const seenIds = new Set();
  for (const result of searchResults) {
    if (!seenIds.has(result.id)) {
      seenIds.add(result.id);
      uniqueSearchResults.push(result);
    }
  }

  // 4. 生成订阅源
  const feed = {
    generatedAt: new Date().toISOString(),
    lookbackHours: LOOKBACK_HOURS,
    accounts: accountResults,
    searchResults: uniqueSearchResults,
    stats: {
      accountsWithTweets: accountResults.length,
      totalAccountTweets: accountResults.reduce((sum, a) => sum + a.tweets.length, 0),
      searchResults: uniqueSearchResults.length
    },
    errors: errors.length > 0 ? errors : undefined
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(feed, null, 2));
  await saveState(state);

  console.error('\n✅ 订阅源生成完成');
  console.error(`   - 账号: ${feed.stats.accountsWithTweets} 个账号，${feed.stats.totalAccountTweets} 条推文`);
  console.error(`   - 搜索: ${feed.stats.searchResults} 条结果`);
  console.error(`   - 输出: ${OUTPUT_PATH}`);

  if (errors.length > 0) {
    console.error(`\n⚠️  ${errors.length} 个错误（非致命）`);
  }
}

main().catch(err => {
  console.error('❌ 致命错误:', err.message);
  process.exit(1);
});
