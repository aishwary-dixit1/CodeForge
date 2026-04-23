CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    stdin TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN (
            'PENDING',
            'QUEUED',
            'RUNNING',
            'ACCEPTED',
            'WRONG_ANSWER',
            'TIME_LIMIT',
            'MEMORY_LIMIT',
            'RUNTIME_ERROR',
            'SYSTEM_ERROR'
        )),
    expected_output TEXT,
    stdout TEXT,
    stderr TEXT,
    runtime_ms INTEGER,
    memory_kb INTEGER,
    exit_code INTEGER,
    worker_id TEXT,
    queued_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_pending_created_at
    ON submissions (created_at)
    WHERE status = 'PENDING';
