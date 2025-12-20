const { createClient } = require('redis');

let redisClient = null;
let pubClient = null;
let subClient = null;

async function initializeRedis() {
  try {
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
      },
    };

    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    // Main Redis client for general operations
    redisClient = createClient(redisConfig);

    // Publisher client for Pub/Sub
    pubClient = createClient(redisConfig);

    // Subscriber client for Pub/Sub
    subClient = createClient(redisConfig);

    // Redis 오류는 조용히 처리 (Redis는 선택사항이므로)
    redisClient.on('error', (err) => {
      // 개발 모드에서만 첫 번째 오류만 표시
      if (process.env.NODE_ENV === 'development' && !redisClient._errorLogged) {
        console.log('Redis 연결 실패 (선택사항, 메모리 스토어 사용):', err.message);
        redisClient._errorLogged = true;
      }
    });
    pubClient.on('error', () => {}); // 조용히 무시
    subClient.on('error', () => {}); // 조용히 무시

    await redisClient.connect();
    await pubClient.connect();
    await subClient.connect();

    console.log('Redis clients connected successfully');
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    throw error;
  }
}

function getRedisClient() {
  if (!redisClient) {
    return null; // Return null instead of throwing error
  }
  return redisClient;
}

function getPubClient() {
  if (!pubClient) {
    throw new Error('Redis pub client not initialized. Call initializeRedis() first.');
  }
  return pubClient;
}

function getSubClient() {
  if (!subClient) {
    throw new Error('Redis sub client not initialized. Call initializeRedis() first.');
  }
  return subClient;
}

module.exports = {
  initializeRedis,
  getRedisClient,
  getPubClient,
  getSubClient,
};

