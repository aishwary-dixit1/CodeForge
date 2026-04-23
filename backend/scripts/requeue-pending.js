require('dotenv').config();

const { publishExecutionJob } = require('../config/rabbitmq');
const {
  getPendingSubmissions,
  markQueued
} = require('../services/submission.service');

async function main() {
  const limit = Number(process.env.REQUEUE_BATCH_SIZE || 100);
  const pending = await getPendingSubmissions(limit);

  for (const row of pending) {
    await publishExecutionJob({
      submission_id: row.id,
      language: row.language,
      code: row.code,
      stdin: row.stdin || '',
      timeout_sec: 10
    });

    await markQueued(row.id);
  }

  console.log(`Requeued ${pending.length} pending submissions.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Requeue failed:', error);
  process.exit(1);
});
