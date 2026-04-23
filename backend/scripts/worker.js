require('dotenv').config();

const os = require('os');
const amqp = require('amqplib');

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
const WORKER_ID = process.env.WORKER_ID || `worker-${os.hostname()}`;

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
      channel.nack(msg, false, true);
    }
  });
}

startWorker().catch((error) => {
  console.error('Worker startup failed:', error.message);
  process.exit(1);
});
