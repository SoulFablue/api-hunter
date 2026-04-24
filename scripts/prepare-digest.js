#!/usr/bin/env node

// ============================================================================
// API Hunter — Prepare Digest
// ============================================================================
// 准备摘要：下载订阅源，读取用户配置，打包给 AI
//
// 输出: JSON 到 stdout（包含所有 AI 需要的数据）
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// -- 配置 ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.api-hunter');
const CONFIG_PATH = join(USER_DIR, 'config.json');

const FEED_URL = 'https://raw.githubusercontent.com/你的用户名/api-hunter/main/feed-apis.json';
const PROMPTS_BASE = 'https://raw.githubusercontent.com/你的用户名/api-hunter/main/prompts';
const PROMPT_FILES = [
  'summarize-api.md',
  'filter-quality.md',
  'digest-intro.md'
];

// -- 辅助函数 -----------------------------------------------------------

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// -- 主函数 -------------------------------------------------------------

async function main() {
  const errors = [];

  // 1. 读取用户配置
  let config = {
    language: 'zh',
    frequency: 'daily',
    delivery: { method: 'stdout' }
  };
  if (existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    } catch (err) {
      errors.push(`无法读取配置: ${err.message}`);
    }
  }

  // 2. 获取订阅源
  // 优先使用本地文件（用于测试），如果不存在则从 GitHub 获取
  const scriptDir = new URL('.', import.meta.url).pathname.slice(1);
  const localFeedPath = join(scriptDir, '..', 'feed-apis.json');

  let feed = null;
  if (existsSync(localFeedPath)) {
    try {
      feed = JSON.parse(await readFile(localFeedPath, 'utf-8'));
      console.error('✅ 使用本地订阅源文件');
    } catch (err) {
      errors.push(`无法读取本地订阅源: ${err.message}`);
    }
  }

  if (!feed) {
    feed = await fetchJSON(FEED_URL);
    if (!feed) {
      errors.push('无法获取订阅源');
    }
  }

  // 3. 加载提示词
  const localPromptsDir = join(scriptDir, '..', 'prompts');
  const userPromptsDir = join(USER_DIR, 'prompts');

  const prompts = {};
  for (const filename of PROMPT_FILES) {
    const key = filename.replace('.md', '').replace(/-/g, '_');
    const userPath = join(userPromptsDir, filename);
    const localPath = join(localPromptsDir, filename);

    // 优先级: 用户自定义 > GitHub 远程 > 本地默认
    if (existsSync(userPath)) {
      prompts[key] = await readFile(userPath, 'utf-8');
    } else {
      const remote = await fetchText(`${PROMPTS_BASE}/${filename}`);
      if (remote) {
        prompts[key] = remote;
      } else if (existsSync(localPath)) {
        prompts[key] = await readFile(localPath, 'utf-8');
      } else {
        errors.push(`无法加载提示词: ${filename}`);
      }
    }
  }

  // 4. 构建输出
  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    config: {
      language: config.language || 'zh',
      frequency: config.frequency || 'daily',
      delivery: config.delivery || { method: 'stdout' }
    },
    feed: feed || { accounts: [], searchResults: [] },
    stats: {
      accountsWithTweets: feed?.stats?.accountsWithTweets || 0,
      totalAccountTweets: feed?.stats?.totalAccountTweets || 0,
      searchResults: feed?.stats?.searchResults || 0
    },
    prompts,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    status: 'error',
    message: err.message
  }));
  process.exit(1);
});
