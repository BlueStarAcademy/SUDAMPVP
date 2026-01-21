const Queue = require('bull');
const { getRedisClient } = require('../config/redis');

// Create queue for AI requests
const aiQueue = new Queue('ai-requests', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// 큐 연결 에러 핸들링
aiQueue.on('error', (error) => {
  console.error('[AIQueue] Queue error:', error.message);
  console.error('[AIQueue] Redis 연결이 필요합니다. Redis를 시작하거나 AI 작업이 실패할 수 있습니다.');
});

aiQueue.on('waiting', (jobId) => {
  console.log(`[AIQueue] Job ${jobId} is waiting`);
});

aiQueue.on('active', (job) => {
  console.log(`[AIQueue] Job ${job.id} is now active`);
});

aiQueue.on('failed', (job, err) => {
  console.error(`[AIQueue] Job ${job.id} failed:`, err.message);
});

aiQueue.on('completed', (job) => {
  console.log(`[AIQueue] Job ${job.id} completed`);
});

module.exports = aiQueue;

