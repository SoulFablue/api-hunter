#!/usr/bin/env node

// ============================================================================
// API Hunter — 测试脚本
// ============================================================================
// 测试 generate-feed.js 的逻辑，使用模拟数据而不是真实 API
// ============================================================================

import { writeFile } from 'fs/promises';
import { join } from 'path';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname.slice(1);
const OUTPUT_PATH = join(SCRIPT_DIR, '..', 'feed-apis.json');
const STATE_PATH = join(SCRIPT_DIR, '..', 'state-feed.json');

console.error('🧪 API Hunter - 测试模式\n');
console.error('使用模拟数据测试脚本逻辑...\n');

// 模拟数据
const mockFeed = {
  generatedAt: new Date().toISOString(),
  lookbackHours: 24,
  accounts: [
    {
      source: 'account',
      name: 'Pieter Levels',
      handle: 'levelsio',
      bio: 'Maker of Nomad List, Remote OK, Photo AI',
      tweets: [
        {
          id: 'mock_tweet_1',
          text: 'Just launched a new API for Photo AI - generate professional headshots with AI. Free tier: 10 images/month. https://photoai.com/api',
          createdAt: new Date().toISOString(),
          url: 'https://x.com/levelsio/status/mock_tweet_1',
          urls: ['https://photoai.com/api'],
          likes: 234,
          retweets: 45
        },
        {
          id: 'mock_tweet_2',
          text: 'Supabase is amazing for building APIs quickly. Open source Firebase alternative with PostgreSQL. https://supabase.com',
          createdAt: new Date().toISOString(),
          url: 'https://x.com/levelsio/status/mock_tweet_2',
          urls: ['https://supabase.com'],
          likes: 156,
          retweets: 23
        }
      ]
    },
    {
      source: 'account',
      name: 'Guillermo Rauch',
      handle: 'rauchg',
      bio: 'CEO @vercel',
      tweets: [
        {
          id: 'mock_tweet_3',
          text: 'Vercel AI SDK makes it super easy to build AI apps. Stream responses, handle errors, works with any LLM. https://sdk.vercel.ai',
          createdAt: new Date().toISOString(),
          url: 'https://x.com/rauchg/status/mock_tweet_3',
          urls: ['https://sdk.vercel.ai'],
          likes: 567,
          retweets: 89
        }
      ]
    }
  ],
  searchResults: [
    {
      id: 'mock_search_1',
      text: 'New API alert: Resend - developer-first email API. Simple SDK, great docs, 100 emails/day free. https://resend.com',
      createdAt: new Date().toISOString(),
      url: 'https://x.com/t3dotgg/status/mock_search_1',
      urls: ['https://resend.com'],
      likes: 89,
      retweets: 12,
      author: {
        name: 'Theo',
        handle: 't3dotgg'
      }
    },
    {
      id: 'mock_search_2',
      text: 'Upstash launched serverless Redis API. Pay per request, global edge network. Perfect for Next.js apps. https://upstash.com',
      createdAt: new Date().toISOString(),
      url: 'https://x.com/upstash/status/mock_search_2',
      urls: ['https://upstash.com'],
      likes: 145,
      retweets: 34,
      author: {
        name: 'Upstash',
        handle: 'upstash'
      }
    }
  ],
  stats: {
    accountsWithTweets: 2,
    totalAccountTweets: 3,
    searchResults: 2
  }
};

// 模拟状态文件
const mockState = {
  seenTweets: {
    'mock_tweet_1': Date.now(),
    'mock_tweet_2': Date.now(),
    'mock_tweet_3': Date.now(),
    'mock_search_1': Date.now(),
    'mock_search_2': Date.now()
  }
};

async function main() {
  console.error('1. 生成模拟订阅源...');
  await writeFile(OUTPUT_PATH, JSON.stringify(mockFeed, null, 2));
  console.error(`   ✅ 已写入: ${OUTPUT_PATH}`);

  console.error('\n2. 生成模拟状态文件...');
  await writeFile(STATE_PATH, JSON.stringify(mockState, null, 2));
  console.error(`   ✅ 已写入: ${STATE_PATH}`);

  console.error('\n📊 统计信息:');
  console.error(`   - 追踪账号: ${mockFeed.stats.accountsWithTweets} 个`);
  console.error(`   - 账号推文: ${mockFeed.stats.totalAccountTweets} 条`);
  console.error(`   - 搜索结果: ${mockFeed.stats.searchResults} 条`);
  console.error(`   - 总计: ${mockFeed.stats.totalAccountTweets + mockFeed.stats.searchResults} 条推文`);

  console.error('\n✅ 测试完成！');
  console.error('\n下一步:');
  console.error('   1. 查看生成的文件: feed-apis.json');
  console.error('   2. 测试 prepare-digest.js: node prepare-digest.js');
  console.error('   3. 获取真实 X API Token 后，运行: node generate-feed.js');
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
