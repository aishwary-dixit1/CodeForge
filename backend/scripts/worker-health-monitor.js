require('dotenv').config();

const pool = require('../config/db');
const redis = require('../config/redis');

const WORKER_HEARTBEAT_TIMEOUT_MS = Number(process.env.WORKER_HEARTBEAT_TIMEOUT_MS || 60000); // 60 seconds
const HEARTBEAT_CHECK_INTERVAL_MS = Number(process.env.HEARTBEAT_CHECK_INTERVAL_MS || 15000); // 15 seconds

/**
 * Heartbeat Monitor: Detects crashed workers
 * - Tracks worker liveness via Redis heartbeat keys
 * - Detects workers that missed heartbeat (timed out)
 * - Moves stuck jobs to SYSTEM_ERROR
 * - Updates worker_heartbeats table
 */

async function findStuckJobs() {
  try {
    // Find all jobs in RUNNING state
    const result = await pool.query(
      `SELECT id, worker_id, started_at FROM submissions WHERE status = 'RUNNING'`
    );

    for (const job of result.rows) {
      const heartbeatKey = `exec:running:${job.id}`;

      // Check if heartbeat key exists in Redis
      const heartbeat = await redis.get(heartbeatKey);

      if (!heartbeat) {
        const startedAt = new Date(job.started_at);
        const elapsedMs = Date.now() - startedAt.getTime();

        // If job has been running longer than heartbeat timeout, it's stuck
        if (elapsedMs > WORKER_HEARTBEAT_TIMEOUT_MS) {
          console.log(
            `[Heartbeat] Job ${job.id} stuck for ${Math.round(elapsedMs / 1000)}s on worker ${job.worker_id}`
          );

          // Mark as SYSTEM_ERROR
          await pool.query(
            `UPDATE submissions 
             SET status = 'SYSTEM_ERROR', 
                 stderr = $1, 
                 finished_at = now() 
             WHERE id = $2`,
            [
              `Worker ${job.worker_id} heartbeat timeout after ${Math.round(elapsedMs / 1000)}s`,
              job.id
            ]
          );

          // Clear the running heartbeat key
          await redis.del(heartbeatKey);

          console.log(`[Heartbeat] Moved job ${job.id} to SYSTEM_ERROR`);
        }
      }
    }
  } catch (error) {
    console.error('[Heartbeat] Error checking stuck jobs:', error.message);
  }
}

async function updateWorkerHeartbeats() {
  try {
    // Get all active workers from submissions (workers with recent jobs)
    const result = await pool.query(
      `SELECT DISTINCT worker_id FROM submissions 
       WHERE status IN ('RUNNING', 'QUEUED') 
       AND worker_id IS NOT NULL`
    );

    for (const row of result.rows) {
      const workerId = row.worker_id;

      // Check if worker has any running jobs
      const jobResult = await pool.query(
        `SELECT id FROM submissions WHERE worker_id = $1 AND status = 'RUNNING' LIMIT 1`,
        [workerId]
      );

      const currentJobId = jobResult.rows[0]?.id || null;
      const workerStatus = currentJobId ? 'working' : 'idle';

      // Get job completion count
      const statsResult = await pool.query(
        `SELECT COUNT(*) as completed FROM submissions 
         WHERE worker_id = $1 AND status IN ('ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR')`,
        [workerId]
      );

      const completedCount = Number(statsResult.rows[0]?.completed || 0);

      // Upsert worker heartbeat
      await pool.query(
        `INSERT INTO worker_heartbeats (worker_id, last_heartbeat, jobs_completed, current_job_submission_id, status)
         VALUES ($1, now(), $2, $3, $4)
         ON CONFLICT (worker_id) DO UPDATE SET
           last_heartbeat = now(),
           jobs_completed = $2,
           current_job_submission_id = $3,
           status = $4,
           updated_at = now()`,
        [workerId, completedCount, currentJobId, workerStatus]
      );
    }

    // Mark workers as dead if they haven't updated in 2x heartbeat timeout
    const deadWorkers = await pool.query(
      `UPDATE worker_heartbeats 
       SET status = 'dead', updated_at = now()
       WHERE status != 'dead' 
       AND updated_at < now() - INTERVAL '1 minute'
       RETURNING worker_id`
    );

    if (deadWorkers.rows.length > 0) {
      console.log(`[Heartbeat] Marked ${deadWorkers.rows.length} workers as dead`);
    }
  } catch (error) {
    console.error('[Heartbeat] Error updating worker heartbeats:', error.message);
  }
}

async function startHeartbeatMonitor() {
  console.log('[Heartbeat] Monitor started, checking every', HEARTBEAT_CHECK_INTERVAL_MS / 1000, 'seconds');

  // Run checks immediately and then at interval
  await findStuckJobs();
  await updateWorkerHeartbeats();

  setInterval(async () => {
    await findStuckJobs();
    await updateWorkerHeartbeats();
  }, HEARTBEAT_CHECK_INTERVAL_MS);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Heartbeat] Shutting down gracefully...');
    await redis.disconnect();
    await pool.end();
    process.exit(0);
  });
}

startHeartbeatMonitor().catch((error) => {
  console.error('[Heartbeat] Startup failed:', error.message);
  process.exit(1);
});
