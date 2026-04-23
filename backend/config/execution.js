const EXECUTION_LIMITS = {
  memory: process.env.EXEC_MEMORY_LIMIT || '256m',
  cpus: process.env.EXEC_CPU_LIMIT || '0.5',
  pidsLimit: Number(process.env.EXEC_PIDS_LIMIT || 64),
  tmpfs: process.env.EXEC_TMPFS || '/tmp:size=32m,noexec,nodev,nosuid'
};

const LANGUAGE_CONFIG = {
  python3: {
    image: process.env.IMAGE_PYTHON3 || 'codeforge/runner-python3:latest',
    fileName: 'solution.py',
    command: (timeoutSec) => ['timeout', String(timeoutSec), 'python3', '/code/solution.py']
  },
  nodejs20: {
    image: process.env.IMAGE_NODEJS20 || 'codeforge/runner-nodejs20:latest',
    fileName: 'solution.js',
    command: (timeoutSec) => ['timeout', String(timeoutSec), 'node', '/code/solution.js']
  },
  java17: {
    image: process.env.IMAGE_JAVA17 || 'codeforge/runner-java17:latest',
    fileName: 'Main.java',
    command: (timeoutSec) => [
      'timeout',
      String(timeoutSec),
      'sh',
      '-lc',
      'javac /code/Main.java -d /tmp ; java -cp /tmp Main'
    ]
  },
  cpp20: {
    image: process.env.IMAGE_CPP20 || 'codeforge/runner-cpp20:latest',
    fileName: 'solution.cpp',
    command: (timeoutSec) => [
      'timeout',
      String(timeoutSec),
      'sh',
      '-lc',
      'g++ -std=c++20 /code/solution.cpp -O2 -o /tmp/a.out ; /tmp/a.out'
    ]
  }
};

module.exports = {
  EXECUTION_LIMITS,
  LANGUAGE_CONFIG
};
