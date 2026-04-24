const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { EXECUTION_LIMITS, LANGUAGE_CONFIG } = require('../config/execution');

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));

    if (typeof options.stdinText === 'string') {
      child.stdin.write(options.stdinText);
    }
    child.stdin.end();

    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function buildDockerArgs({ submissionId, codeDir, language, timeoutSec }) {
  const langConfig = LANGUAGE_CONFIG[language];
  if (!langConfig) {
    throw new Error(`Unsupported language for execution engine: ${language}`);
  }

  return [
    'run',
    '--rm',
    '-i',
    '--name',
    `exec-${submissionId}`,
    '--network',
    'none',
    '--memory',
    EXECUTION_LIMITS.memory,
    '--cpus',
    EXECUTION_LIMITS.cpus,
    '--pids-limit',
    String(EXECUTION_LIMITS.pidsLimit),
    '--read-only',
    '--tmpfs',
    EXECUTION_LIMITS.tmpfs,
    '--tmpfs',
    EXECUTION_LIMITS.execTmpfs,
    '-v',
    `${codeDir}:/code:ro`,
    langConfig.image,
    ...langConfig.command(timeoutSec)
  ];
}

async function writeSubmissionCode({ submissionId, language, code }) {
  const langConfig = LANGUAGE_CONFIG[language];
  if (!langConfig) {
    throw new Error(`Unsupported language for execution engine: ${language}`);
  }

  const baseDir = path.join(os.tmpdir(), 'codeforge', 'submissions');
  const submissionDir = path.join(baseDir, submissionId);

  await fs.mkdir(submissionDir, { recursive: true });
  await fs.writeFile(path.join(submissionDir, langConfig.fileName), code, 'utf8');

  return submissionDir;
}

function classifyFailure({ code, stderr, signal }) {
  const combined = `${stderr || ''} ${signal || ''}`.toLowerCase();

  return {
    timedOut: code === 124 || combined.includes('timed out'),
    oom: code === 137 || combined.includes('oom') || combined.includes('out of memory')
  };
}

async function executeCodeLocally({
  submissionId,
  language,
  code,
  stdin = '',
  timeoutSec = 10
}) {
  const codeDir = await writeSubmissionCode({ submissionId, language, code });

  try {
    const dockerArgs = buildDockerArgs({
      submissionId,
      codeDir,
      language,
      timeoutSec
    });

    const result = await runProcess('docker', dockerArgs, {
      windowsHide: true,
      stdinText: stdin
    });

    const failureInfo = classifyFailure({
      code: result.code,
      stderr: result.stderr,
      signal: result.signal
    });

    return {
      exitCode: typeof result.code === 'number' ? result.code : 1,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: failureInfo.timedOut,
      oom: failureInfo.oom
    };
  } finally {
    await fs.rm(codeDir, { recursive: true, force: true });
  }
}

module.exports = {
  executeCodeLocally
};
