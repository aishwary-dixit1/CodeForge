require('dotenv').config();

const os = require('os');
const amqp = require('amqplib');
const pool = require('../config/db');

const { executeCodeLocally } = require('../services/execution.service');
const { determineVerdict } = require('../services/verdict.service');
const {
  markRunning,
  finalizeSubmission
} = require('../services/submission.service');
const {
  setRunningHeartbeat,
  clearRunningHeartbeat,
  cacheExecutionResult
} = require('../services/result-cache.service');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXECUTION_QUEUE = process.env.EXECUTION_QUEUE || 'execution.queue';
const RESULT_TTL_SECONDS = Number(process.env.RESULT_TTL_SECONDS || 300);
const WORKER_HEARTBEAT_SECONDS = Number(process.env.WORKER_HEARTBEAT_SECONDS || 30);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);

async function sendToDLQ(job, retryCount, error) {
  try {
    await pool.query(
      `INSERT INTO dead_letter_queue (submission_id, job_payload, retry_count, max_retries, last_error, worker_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [job.submission_id, JSON.stringify(job), retryCount, MAX_RETRIES, error, WORKER_ID]
    );
    console.log(`[${WORKER_ID}] Moved submission ${job.submission_id} to DLQ after ${retryCount} retries`);
  } catch (err) {
    console.error(`[${WORKER_ID}] Failed to send job to DLQ:`, err.message);
  }
}

async function processJob(channel, msg) {
  const job = JSON.parse(msg.content.toString());

  await markRunning(job.submission_id, WORKER_ID);
  await setRunningHeartbeat(job.submission_id, WORKER_ID, WORKER_HEARTBEAT_SECONDS);

  const startedAt = Date.now();
  const result = await executeCodeLocally({
    submissionId: job.submission_id,
    language: job.language,
    code: job.code,
    stdin: job.stdin || '',
    timeoutSec: Number(job.timeout_sec || 10)
  });

  const runtimeMs = Date.now() - startedAt;
  const verdict = determineVerdict(result, job.expected_output);

  await cacheExecutionResult(
    job.submission_id,
    {
      status: verdict,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: String(result.exitCode),
      runtime_ms: String(runtimeMs)
    },
    RESULT_TTL_SECONDS
  );

  await finalizeSubmission({
    submissionId: job.submission_id,
    status: verdict,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    runtimeMs,
    workerId: WORKER_ID
  });

  await clearRunningHeartbeat(job.submission_id);
  channel.ack(msg);
}

async function startWorker() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertQueue(EXECUTION_QUEUE, { durable: true });
  channel.prefetch(1);

  console.log(`[${WORKER_ID}] waiting for jobs on ${EXECUTION_QUEUE}`);

  channel.consume(EXECUTION_QUEUE, async (msg) => {
    if (!msg) {
      return;
    }

    try {
      await processJob(channel, msg);
    } catch (error) {
      console.error(`[${WORKER_ID}] worker failed:`, error.message);

      const job = JSON.parse(msg.content.toString());
      const retryCount = job.retry_count || 0;

      if (retryCount < MAX_RETRIES) {
        // Requeue for retry
        console.log(
          `[${WORKER_ID}] Requeuing submission ${job.submission_id} for retry (${retryCount + 1}/${MAX_RETRIES})`
        );
        channel.nack(msg, false, true);
      } else {
        // Max retries exceeded - move to DLQ
        await sendToDLQ(job, retryCount, error.message);
        channel.ack(msg);
      }
    }
  });
}

startWorker().catch((error) => {
  console.error('Worker startup failed:', error.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`[${WORKER_ID}] Received SIGTERM, shutting down gracefully...`);
  await pool.end();
  process.exit(0);
});
