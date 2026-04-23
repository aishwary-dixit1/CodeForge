const db = require('../config/db');
const { publishExecutionJob } = require('../config/rabbitmq');

async function createSubmission({ id, userId = null, language, code, stdin }) {
  const result = await db.query(
    `
      INSERT INTO submissions (id, user_id, language, code, stdin, status)
      VALUES ($1, $2, $3, $4, $5, 'PENDING')
      RETURNING id, user_id, language, status, created_at
    `,
    [id, userId, language, code, stdin]
  );

  return result.rows[0];
}

async function enqueueExecutionJob({ submissionId, language, code, stdin, timeoutSec }) {
  const jobPayload = {
    submission_id: submissionId,
    language,
    code,
    stdin,
    timeout_sec: timeoutSec
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
      SELECT id, user_id, language, status, created_at, queued_at, started_at, finished_at
      FROM submissions
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  createSubmission,
  enqueueExecutionJob,
  getSubmissionById,
  getPendingSubmissions,
  markQueued
};
