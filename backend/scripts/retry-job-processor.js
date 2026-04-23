require('dotenv').config();

const amqp = require('amqplib');
const pool = require('../config/db');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXECUTION_QUEUE = process.env.EXECUTION_QUEUE || 'execution.queue';
const DLQ_POLL_INTERVAL_MS = Number(process.env.DLQ_POLL_INTERVAL_MS || 10000);

/**
 * DLQ Processor: Handles dead letter queue items
 * - Retries failed jobs up to max_retries (default 3)
 * - Moves jobs to SYSTEM_ERROR after max retries exceeded
 */

async function processDLQItem(channel, dlqItem) {
  const { id, submission_id, job_payload, retry_count, max_retries, last_error } = dlqItem;

  if (retry_count >= max_retries) {
    // Max retries exceeded - mark as SYSTEM_ERROR
    await pool.query(
      `UPDATE submissions 
       SET status = 'SYSTEM_ERROR', 
           stderr = $1, 
           finished_at = now() 
       WHERE id = $2`,
      [`Job failed after ${max_retries} retries. Last error: ${last_error}`, submission_id]
    );

    // Remove from DLQ
    await pool.query('DELETE FROM dead_letter_queue WHERE id = $1', [id]);

    console.log(`[DLQ] Moved submission ${submission_id} to SYSTEM_ERROR after ${max_retries} retries`);
    return;
  }

  // Retry: send back to queue with incremented retry count
  const updatedPayload = { ...job_payload, retry_count: retry_count + 1 };

  await channel.sendToQueue(
    EXECUTION_QUEUE,
    Buffer.from(JSON.stringify(updatedPayload)),
    { persistent: true }
  );

  // Update retry count in DB
  await pool.query(
    `UPDATE submissions SET retry_count = $1 WHERE id = $2`,
    [retry_count + 1, submission_id]
  );

  // Remove from DLQ
  await pool.query('DELETE FROM dead_letter_queue WHERE id = $1', [id]);

  console.log(
    `[DLQ] Requeued submission ${submission_id} (attempt ${retry_count + 2}/${max_retries + 1})`
  );
}

async function scanDLQ(channel) {
  try {
    const result = await pool.query(
      `SELECT id, submission_id, job_payload, retry_count, max_retries, last_error
       FROM dead_letter_queue
       ORDER BY created_at ASC
       LIMIT 10`
    );

    for (const dlqItem of result.rows) {
      await processDLQItem(channel, dlqItem);
    }

    if (result.rows.length > 0) {
      console.log(`[DLQ] Processed ${result.rows.length} DLQ items`);
    }
  } catch (error) {
    console.error('[DLQ] Error scanning DLQ:', error.message);
  }
}

async function startDLQProcessor() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertQueue(EXECUTION_QUEUE, { durable: true });

  console.log('[DLQ] Processor started, scanning every', DLQ_POLL_INTERVAL_MS / 1000, 'seconds');

  // Scan DLQ periodically
  setInterval(() => scanDLQ(channel), DLQ_POLL_INTERVAL_MS);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[DLQ] Shutting down gracefully...');
    await connection.close();
    process.exit(0);
  });
}

startDLQProcessor().catch((error) => {
  console.error('[DLQ] Startup failed:', error.message);
  process.exit(1);
});
