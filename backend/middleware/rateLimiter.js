const pool = require('../config/database');

const RATE_LIMITS = {
  HOURLY_LIMIT: 3,
  DAILY_LIMIT: 10
};

const rateLimitComplaint = async (req, res, next) => {
  const userId = req.user.id;
  const now = new Date();
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const currentDate = now.toISOString().split('T')[0];

  try {
    // Get or create rate limit record
    const result = await pool.query(
      `INSERT INTO user_rate_limits (user_id, submission_date, hourly_count, daily_count, last_submission)
       VALUES ($1, $2, 0, 0, $3)
       ON CONFLICT (user_id, submission_date)
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, currentDate, now]
    );

    const rateLimit = result.rows[0];
    const lastSubmission = new Date(rateLimit.last_submission);
    const lastSubmissionHour = new Date(lastSubmission.getFullYear(), lastSubmission.getMonth(), 
                                       lastSubmission.getDate(), lastSubmission.getHours());

    let hourlyCount = rateLimit.hourly_count;
    let dailyCount = rateLimit.daily_count;

    // Reset hourly count if we're in a new hour
    if (currentHour > lastSubmissionHour) {
      hourlyCount = 0;
    }

    // Check limits
    if (hourlyCount >= RATE_LIMITS.HOURLY_LIMIT) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${RATE_LIMITS.HOURLY_LIMIT} complaints per hour allowed. Please try again later.`,
        retryAfter: 3600 - (Math.floor((now - currentHour) / 1000))
      });
    }

    if (dailyCount >= RATE_LIMITS.DAILY_LIMIT) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${RATE_LIMITS.DAILY_LIMIT} complaints per day allowed. Please try again tomorrow.`,
        retryAfter: 86400 - (Math.floor((now - new Date(currentDate)) / 1000))
      });
    }

    // Update counts
    await pool.query(
      `UPDATE user_rate_limits 
       SET hourly_count = $1, daily_count = $2, last_submission = $3, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $4 AND submission_date = $5`,
      [hourlyCount + 1, dailyCount + 1, now, userId, currentDate]
    );

    next();
  } catch (error) {
    console.error('Rate limit check error:', error);
    res.status(500).json({ error: 'Rate limit check failed' });
  }
};

module.exports = { rateLimitComplaint, RATE_LIMITS };