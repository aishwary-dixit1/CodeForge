function normalizeOutput(value) {
  return String(value || '').replace(/\r\n/g, '\n').trimEnd();
}

function determineVerdict(result, expectedOutput) {
  if (result.timedOut) return 'TIME_LIMIT';
  if (result.oom) return 'MEMORY_LIMIT';
  if (result.exitCode !== 0) return 'RUNTIME_ERROR';
  if (!expectedOutput) return 'ACCEPTED';

  return normalizeOutput(result.stdout) === normalizeOutput(expectedOutput)
    ? 'ACCEPTED'
    : 'WRONG_ANSWER';
}

module.exports = {
  determineVerdict,
  normalizeOutput
};
