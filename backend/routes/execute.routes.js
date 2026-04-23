const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const { SUPPORTED_LANGUAGES } = require('../config/languages');
const {
  createSubmission,
  enqueueExecutionJob,
  getSubmissionById
} = require('../services/submission.service');
const { getCachedExecutionResult } = require('../services/result-cache.service');

const router = express.Router();

router.post(
  '/execute',
  [
    body('language').isIn(SUPPORTED_LANGUAGES).withMessage('Unsupported language'),
    body('code')
      .isString()
      .notEmpty()
      .isLength({ max: 50000 })
      .withMessage('Code must be a non-empty string with max length 50000'),
    body('stdin').optional().isString().isLength({ max: 10000 }),
    body('expected_output').optional().isString().isLength({ max: 50000 }),
    body('timeout_sec').optional().isInt({ min: 1, max: 30 }).toInt()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      language,
      code,
      stdin = '',
      expected_output = null,
      timeout_sec = 10
    } = req.body;
    const submissionId = uuidv4();

    try {
      await createSubmission({
        id: submissionId,
        language,
        code,
        stdin,
        expectedOutput: expected_output
      });

      await enqueueExecutionJob({
        submissionId,
        language,
        code,
        stdin,
        expectedOutput: expected_output,
        timeoutSec: timeout_sec
      });

      return res.status(202).json({
        submission_id: submissionId,
        status: 'QUEUED',
        poll_url: `/execute/${submissionId}`
      });
    } catch (error) {
      console.error('Execution submission failed:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

router.get(
  '/execute/:submissionId',
  [param('submissionId').isUUID().withMessage('Invalid submission id')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const cachedResult = await getCachedExecutionResult(req.params.submissionId);
    if (cachedResult) {
      return res.status(200).json({
        submission_id: req.params.submissionId,
        source: 'redis',
        ...cachedResult
      });
    }

    const submission = await getSubmissionById(req.params.submissionId);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    return res.status(200).json({
      submission_id: submission.id,
      source: 'postgres',
      status: submission.status,
      language: submission.language,
      created_at: submission.created_at,
      queued_at: submission.queued_at,
      started_at: submission.started_at,
      finished_at: submission.finished_at,
      stdout: submission.stdout,
      stderr: submission.stderr,
      exit_code: submission.exit_code,
      runtime_ms: submission.runtime_ms,
      expected_output: submission.expected_output
    });
  }
);

module.exports = router;
