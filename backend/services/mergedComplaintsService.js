const pool = require('../config/database');
const { maskPhoneNumber } = require('../utils/phoneUtils');

/**
 * Get all reporters for a merged issue
 * Returns primary reporter and additional reporter count
 */
const getIssueReporters = async (issueId, client = null) => {
  const db = client || pool;
  
  const query = `
    SELECT 
      c.id as complaint_id,
      c.user_id,
      c.created_at,
      c.is_primary,
      u.full_name,
      u.email,
      u.phone,
      ROW_NUMBER() OVER (ORDER BY c.created_at ASC) as report_order
    FROM complaints c
    JOIN users u ON c.user_id = u.id
    WHERE c.issue_id = $1
    ORDER BY c.created_at ASC
  `;
  
  const result = await db.query(query, [issueId]);
  
  if (result.rows.length === 0) {
    return {
      totalReports: 0,
      primaryReporter: null,
      additionalReporters: 0,
      allReporters: []
    };
  }
  
  // Primary reporter is the first one (earliest created_at)
  const primaryReporter = result.rows[0];
  const additionalReporters = result.rows.length - 1;
  
  return {
    totalReports: result.rows.length,
    primaryReporter: {
      userId: primaryReporter.user_id,
      name: primaryReporter.full_name,
      email: primaryReporter.email,
      phoneMasked: maskPhoneNumber(primaryReporter.phone),
      reportedAt: primaryReporter.created_at,
      complaintId: primaryReporter.complaint_id
    },
    additionalReporters,
    allReporters: result.rows.map(reporter => ({
      userId: reporter.user_id,
      name: reporter.full_name,
      email: reporter.email,
      phone: reporter.phone,
      phoneMasked: maskPhoneNumber(reporter.phone),
      reportedAt: reporter.created_at,
      complaintId: reporter.complaint_id,
      reportOrder: reporter.report_order
    }))
  };
};

/**
 * Get authority view of merged issues
 */
const getAuthorityIssuesView = async (authorityId, status = null, client = null) => {
  const db = client || pool;
  
  let statusFilter = '';
  let params = [authorityId];
  
  if (status) {
    statusFilter = 'AND i.status = $2';
    params.push(status);
  }
  
  const query = `
    SELECT 
      i.id as issue_id,
      i.status,
      i.echo_count,
      i.first_reported_at,
      i.last_reported_at,
      i.verified_at,
      i.resolved_at,
      cat.name as category_name,
      ST_Y(i.location::geometry) as latitude,
      ST_X(i.location::geometry) as longitude,
      COUNT(c.id) as total_reports,
      MIN(c.created_at) as first_complaint_at,
      MAX(c.created_at) as last_complaint_at
    FROM issues i
    JOIN categories cat ON i.category_id = cat.id
    LEFT JOIN complaints c ON c.issue_id = i.id
    WHERE i.verified_by = $1 OR i.resolved_by = $1
    ${statusFilter}
    GROUP BY i.id, cat.name
    ORDER BY i.last_reported_at DESC
  `;
  
  const result = await db.query(query, params);
  
  // Get reporter details for each issue
  const issuesWithReporters = await Promise.all(
    result.rows.map(async (issue) => {
      const reporters = await getIssueReporters(issue.issue_id, db);
      
      return {
        issueId: issue.issue_id,
        status: issue.status,
        echoCount: issue.echo_count,
        totalReports: reporters.totalReports,
        categoryName: issue.category_name,
        location: {
          latitude: issue.latitude,
          longitude: issue.longitude
        },
        timeline: {
          firstReported: issue.first_reported_at,
          lastReported: issue.last_reported_at,
          verified: issue.verified_at,
          resolved: issue.resolved_at
        },
        primaryReporter: reporters.primaryReporter,
        additionalReporters: reporters.additionalReporters
      };
    })
  );
  
  return issuesWithReporters;
};

/**
 * Get all reporters contact info (restricted access)
 */
const getAllReportersContact = async (issueId, requestingUserId, userRole, client = null) => {
  // Only authorities and admins can access full contact info
  if (!['authority', 'admin'].includes(userRole)) {
    throw new Error('Access denied. Authority or Admin role required.');
  }
  
  const db = client || pool;
  
  const reporters = await getIssueReporters(issueId, db);
  
  if (reporters.totalReports === 0) {
    throw new Error('Issue not found or no reporters');
  }
  
  // Log access for audit
  const auditLog = require('../middleware/auditLog');
  await auditLog(
    requestingUserId,
    'ISSUE_CONTACTS_ACCESSED',
    'issue',
    issueId,
    {
      totalReporters: reporters.totalReports,
      accessedBy: requestingUserId,
      userRole
    }
  );
  
  return {
    issueId,
    totalReports: reporters.totalReports,
    reporters: reporters.allReporters.map(reporter => ({
      complaintId: reporter.complaintId,
      name: reporter.name,
      email: reporter.email,
      phone: reporter.phone || 'Not provided',
      reportedAt: reporter.reportedAt,
      reportOrder: reporter.reportOrder
    })),
    warning: 'This information is confidential. Use only for official purposes.'
  };
};

/**
 * Notify all reporters about issue updates
 */
const notifyAllReporters = async (issueId, updateType, updateDetails, client = null) => {
  const db = client || pool;
  
  const reporters = await getIssueReporters(issueId, db);
  
  if (reporters.totalReports === 0) {
    return { notified: 0, errors: [] };
  }
  
  const notifications = [];
  const errors = [];
  
  for (const reporter of reporters.allReporters) {
    try {
      // Create notification record
      const notificationResult = await db.query(
        `INSERT INTO notifications (
          user_id, issue_id, complaint_id, type, title, message, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id`,
        [
          reporter.userId,
          issueId,
          reporter.complaintId,
          updateType,
          `Issue Update: ${updateDetails.title}`,
          updateDetails.message
        ]
      );
      
      notifications.push({
        userId: reporter.userId,
        notificationId: notificationResult.rows[0].id,
        email: reporter.email
      });
      
    } catch (error) {
      errors.push({
        userId: reporter.userId,
        error: error.message
      });
    }
  }
  
  // Log notification activity
  const auditLog = require('../middleware/auditLog');
  await auditLog(
    null, // System action
    'REPORTERS_NOTIFIED',
    'issue',
    issueId,
    {
      updateType,
      totalReporters: reporters.totalReports,
      notified: notifications.length,
      errors: errors.length
    }
  );
  
  return {
    notified: notifications.length,
    errors,
    notifications
  };
};

module.exports = {
  getIssueReporters,
  getAuthorityIssuesView,
  getAllReportersContact,
  notifyAllReporters
};