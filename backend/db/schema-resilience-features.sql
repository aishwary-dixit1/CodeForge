-- Phase 4: Production Scaling + Reliability
-- Add DLQ tracking and retry management

-- Add dead_letter_queue table for failed jobs
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id),
    job_payload JSONB NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error TEXT,
    worker_id TEXT,
    failed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add retry tracking to submissions
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3;

-- Add index for DLQ querying
CREATE INDEX IF NOT EXISTS idx_dlq_created_at ON dead_letter_queue(created_at DESC);

-- Add heartbeat tracking in Redis is handled via TTL, but we track worker uptime here
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id TEXT NOT NULL UNIQUE,
    last_heartbeat TIMESTAMPTZ DEFAULT now(),
    jobs_completed INTEGER DEFAULT 0,
    current_job_submission_id UUID,
    status TEXT CHECK (status IN ('idle', 'working', 'dead')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for finding dead workers
CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_updated ON worker_heartbeats(updated_at);
