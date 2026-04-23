const redis = require('../config/redis');

function resultKey(submissionId) {
  return `exec:result:${submissionId}`;
}

function runningKey(submissionId) {
  return `exec:running:${submissionId}`;
}

async function setRunningHeartbeat(submissionId, workerId, ttlSeconds = 30) {
  await redis.set(runningKey(submissionId), workerId, 'EX', ttlSeconds);
}

async function clearRunningHeartbeat(submissionId) {
  await redis.del(runningKey(submissionId));
}

async function cacheExecutionResult(submissionId, payload, ttlSeconds) {
  await redis.hset(resultKey(submissionId), payload);
  await redis.expire(resultKey(submissionId), ttlSeconds);
}

async function getCachedExecutionResult(submissionId) {
  const result = await redis.hgetall(resultKey(submissionId));
  if (!result || Object.keys(result).length === 0) {
    return null;
  }

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exit_code: Number(result.exit_code || 0),
    runtime_ms: Number(result.runtime_ms || 0)
  };
}

module.exports = {
  setRunningHeartbeat,
  clearRunningHeartbeat,
  cacheExecutionResult,
  getCachedExecutionResult
};
