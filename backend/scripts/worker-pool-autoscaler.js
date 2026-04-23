require('dotenv').config();

const { spawn } = require('child_process');
const path = require('path');
const pool = require('../config/db');
const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXECUTION_QUEUE = process.env.EXECUTION_QUEUE || 'execution.queue';

const AUTOSCALE_INTERVAL_MS = Number(process.env.AUTOSCALE_INTERVAL_MS || 30000); // 30 seconds
const TARGET_QUEUE_DEPTH = Number(process.env.TARGET_QUEUE_DEPTH || 10);
const MIN_WORKERS = Number(process.env.MIN_WORKERS || 2);
const MAX_WORKERS = Number(process.env.MAX_WORKERS || 10);
const SCALE_UP_THRESHOLD = Number(process.env.SCALE_UP_THRESHOLD || 15); // Jobs pending per worker
const SCALE_DOWN_THRESHOLD = Number(process.env.SCALE_DOWN_THRESHOLD || 2); // Jobs pending per worker

/**
 * Autoscaler: Manages worker pool size based on queue depth
 * - Monitors QUEUED job count
 * - Spawns workers when queue backs up
 * - Kills workers when queue clears
 * - Maintains MIN_WORKERS <= active <= MAX_WORKERS
 */

let activeWorkers = new Map(); // workerPid -> { processHandle, startedAt, workerId }

function generateWorkerId() {
  return `worker-auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function spawnWorker() {
  if (activeWorkers.size >= MAX_WORKERS) {
    console.log(`[Autoscale] Already at MAX_WORKERS (${MAX_WORKERS}), skipping spawn`);
    return null;
  }

  const workerId = generateWorkerId();
  const env = { ...process.env, WORKER_ID: workerId };

  const workerProcess = spawn('node', [path.join(__dirname, 'worker.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  console.log(`[Autoscale] Spawned worker ${workerId} (PID: ${workerProcess.pid})`);

  activeWorkers.set(workerProcess.pid, {
    processHandle: workerProcess,
    startedAt: Date.now(),
    workerId
  });

  // Track worker exit
  workerProcess.on('exit', (code) => {
    console.log(`[Autoscale] Worker ${workerId} (PID: ${workerProcess.pid}) exited with code ${code}`);
    activeWorkers.delete(workerProcess.pid);
  });

  // Log worker output
  workerProcess.stdout?.on('data', (data) => {
    console.log(`[${workerId}]`, data.toString().trim());
  });

  workerProcess.stderr?.on('data', (data) => {
    console.error(`[${workerId}] ERROR`, data.toString().trim());
  });

  return workerProcess.pid;
}

async function killWorker(pid) {
  const worker = activeWorkers.get(pid);
  if (!worker) {
    console.log(`[Autoscale] Worker PID ${pid} not found`);
    return;
  }

  console.log(`[Autoscale] Killing worker ${worker.workerId} (PID: ${pid})`);

  try {
    worker.processHandle.kill('SIGTERM');

    // Force kill after 5 seconds if process doesn't exit
    setTimeout(() => {
      if (!worker.processHandle.killed) {
        worker.processHandle.kill('SIGKILL');
      }
    }, 5000);

    activeWorkers.delete(pid);
  } catch (error) {
    console.error(`[Autoscale] Error killing worker ${pid}:`, error.message);
  }
}

async function getQueueMetrics() {
  try {
    // Get queue message count via RabbitMQ
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();

    const queue = await channel.checkQueue(EXECUTION_QUEUE);
    const messageCount = queue.messageCount;

    await connection.close();

    return {
      messageCount,
      activeWorkerCount: activeWorkers.size
    };
  } catch (error) {
    console.error('[Autoscale] Error getting queue metrics:', error.message);
    return { messageCount: 0, activeWorkerCount: activeWorkers.size };
  }
}

async function evaluateScale() {
  try {
    const metrics = await getQueueMetrics();
    const { messageCount, activeWorkerCount } = metrics;

    console.log(
      `[Autoscale] Queue: ${messageCount} messages, Active workers: ${activeWorkerCount}/${MAX_WORKERS}`
    );

    const jobsPerWorker = activeWorkerCount > 0 ? messageCount / activeWorkerCount : messageCount;

    // Scale up if queue is backing up
    if (jobsPerWorker > SCALE_UP_THRESHOLD && activeWorkerCount < MAX_WORKERS) {
      console.log(
        `[Autoscale] Queue backing up: ${messageCount} jobs / ${activeWorkerCount} workers = ${jobsPerWorker.toFixed(1)} jobs/worker`
      );
      for (let i = 0; i < 2 && activeWorkerCount + i < MAX_WORKERS; i++) {
        await spawnWorker();
      }
      return;
    }

    // Scale down if queue is light
    if (jobsPerWorker < SCALE_DOWN_THRESHOLD && activeWorkerCount > MIN_WORKERS) {
      console.log(
        `[Autoscale] Queue light: ${messageCount} jobs / ${activeWorkerCount} workers = ${jobsPerWorker.toFixed(1)} jobs/worker`
      );
      const killCount = Math.max(1, Math.floor(activeWorkerCount / 3));
      const pidsToKill = Array.from(activeWorkers.keys()).slice(0, killCount);
      for (const pid of pidsToKill) {
        await killWorker(pid);
      }
      return;
    }
  } catch (error) {
    console.error('[Autoscale] Error evaluating scale:', error.message);
  }
}

async function startAutoscaler() {
  console.log(
    `[Autoscale] Started (MIN: ${MIN_WORKERS}, MAX: ${MAX_WORKERS}, Check: ${AUTOSCALE_INTERVAL_MS / 1000}s)`
  );

  // Start with minimum workers
  for (let i = 0; i < MIN_WORKERS; i++) {
    await spawnWorker();
  }

  // Evaluate scaling periodically
  setInterval(evaluateScale, AUTOSCALE_INTERVAL_MS);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[Autoscale] Shutting down gracefully, killing all workers...');

    const pids = Array.from(activeWorkers.keys());
    for (const pid of pids) {
      await killWorker(pid);
    }

    await pool.end();
    process.exit(0);
  });
}

startAutoscaler().catch((error) => {
  console.error('[Autoscale] Startup failed:', error.message);
  process.exit(1);
});
