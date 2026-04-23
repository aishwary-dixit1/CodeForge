require('dotenv').config();

const { v4: uuidv4 } = require('uuid');
const { executeCodeLocally } = require('../services/execution.service');
const { determineVerdict } = require('../services/verdict.service');

async function main() {
  const submissionId = uuidv4();
  const language = process.env.PHASE2_LANG || 'python3';
  const code =
    process.env.PHASE2_CODE ||
    "print('hello')";
  const stdin = process.env.PHASE2_STDIN || '';
  const expected = process.env.PHASE2_EXPECTED || 'hello';
  const timeoutSec = Number(process.env.PHASE2_TIMEOUT || 10);

  const result = await executeCodeLocally({
    submissionId,
    language,
    code,
    stdin,
    timeoutSec
  });

  const verdict = determineVerdict(result, expected);

  console.log(
    JSON.stringify(
      {
        submissionId,
        language,
        timeoutSec,
        stdin,
        verdict,
        result
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('Phase 2 smoke test failed:', error.message);
  process.exit(1);
});
