const db = require('../config/db');
const { publishExecutionJob } = require('../config/rabbitmq');

async function createSubmission({
  id,
  userId = null,
  language,
  code,
  stdin,
  expectedOutput = null
}) {
  const result = await db.query(
    `
      INSERT INTO submissions (id, user_id, language, code, stdin, expected_output, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING id, user_id, language, status, created_at
    `,
    [id, userId, language, code, stdin, expectedOutput]
  );

  return result.rows[0];
}

async function enqueueExecutionJob({
  submissionId,
  language,
  code,
  stdin,
  timeoutSec,
  expectedOutput
}) {
  const jobPayload = {
    submission_id: submissionId,
    language,
    code,
    stdin,
    timeout_sec: timeoutSec,
    expected_output: expectedOutput || null
  };

  await publishExecutionJob(jobPayload);

  await db.query(
    `
      UPDATE submissions
      SET status = 'QUEUED', queued_at = now()
      WHERE id = $1
    `,
    [submissionId]
  );

  return true;
}

async function getPendingSubmissions(limit = 100) {
  const result = await db.query(
    `
      SELECT id, language, code, stdin
      FROM submissions
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

async function markQueued(submissionId) {
  await db.query(
    `
      UPDATE submissions
      SET status = 'QUEUED', queued_at = now()
      WHERE id = $1
    `,
    [submissionId]
  );
}

async function getSubmissionById(id) {
  const result = await db.query(
    `
      SELECT
        id,
        user_id,
        language,
        status,
        created_at,
        queued_at,
        started_at,
        finished_at,
        stdout,
        stderr,
        exit_code,
        runtime_ms,
        expected_output
      FROM submissions
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function markRunning(submissionId, workerId) {
  await db.query(
    `
      UPDATE submissions
      SET status = 'RUNNING', started_at = now(), worker_id = $2
      WHERE id = $1
    `,
    [submissionId, workerId]
  );
}

async function finalizeSubmission({
  submissionId,
  status,
  stdout,
  stderr,
  exitCode,
  runtimeMs,
  workerId
}) {
  await db.query(
    `
      UPDATE submissions
      SET
        status = $2,
        stdout = $3,
        stderr = $4,
        exit_code = $5,
        runtime_ms = $6,
        worker_id = $7,
        finished_at = now()
      WHERE id = $1
    `,
    [submissionId, status, stdout, stderr, exitCode, runtimeMs, workerId]
  );
}

module.exports = {
  createSubmission,
  enqueueExecutionJob,
  getSubmissionById,
  getPendingSubmissions,
  markQueued,
  markRunning,
  finalizeSubmission
};
