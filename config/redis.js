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
    
    // 클라이언트가 닫혔을 때 null로 설정
    redisClient.on('end', () => {
      redisClient = null;
    });
    pubClient.on('end', () => {
      pubClient = null;
    });
    subClient.on('end', () => {
      subClient = null;
    });

    await redisClient.connect();
    await pubClient.connect();
    await subClient.connect();

    console.log('Redis clients connected successfully');
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    // 초기화 실패 시 클라이언트를 null로 설정
    redisClient = null;
    pubClient = null;
    subClient = null;
    throw error;
  }
}

function getRedisClient() {
  if (!redisClient) {
    return null; // Return null instead of throwing error
  }
  // Redis v4 클라이언트가 닫혀있는지 확인
  try {
    // 클라이언트가 닫혀있거나 연결되지 않았으면 null 반환
    // Redis v4에서는 isOpen이나 isReady 속성이 없을 수 있으므로
    // 실제로 명령을 실행해보는 것이 가장 확실한 방법이지만,
    // 여기서는 간단히 클라이언트가 존재하는지만 확인
    // 추가: 클라이언트가 연결되어 있는지 확인
    if (redisClient.isOpen === false || redisClient.isReady === false) {
      return null;
    }
    return redisClient;
  } catch (error) {
    // 오류 발생 시 null 반환
    return null;
  }
}

function getPubClient() {
  // Return null if not initialized or closed (Redis is optional)
  if (!pubClient) {
    return null;
  }
  // 클라이언트가 존재하면 반환 (실제 연결 상태는 publish 시 확인)
  return pubClient;
}

function getSubClient() {
  // Return null if not initialized or closed (Redis is optional)
  if (!subClient) {
    return null;
  }
  // 클라이언트가 존재하면 반환
  return subClient;
}

module.exports = {
  initializeRedis,
  getRedisClient,
  getPubClient,
  getSubClient,
};

