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

    redisClient.on('error', (err) => console.error('Redis Client Error:', err));
    pubClient.on('error', (err) => console.error('Redis Pub Client Error:', err));
    subClient.on('error', (err) => console.error('Redis Sub Client Error:', err));

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
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
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

