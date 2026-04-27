const pool = require('../config/database');

/**
 * SLA Service - Handles Service Level Agreement tracking and enforcement
 */
class SLAService {
  /**
   * Ensure required SLA database functions exist with the latest definition.
   * This keeps existing databases in sync even when SQL migrations were applied earlier.
   */
  static async ensureDatabaseFunctions() {
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION calculate_sla_status(
            sla_deadline TIMESTAMP,
            issue_status VARCHAR(20)
        ) RETURNS JSONB AS $$
        DECLARE
            current_ts TIMESTAMP := LOCALTIMESTAMP;
            remaining_seconds INTEGER;
            is_breached BOOLEAN;
            status_color VARCHAR(10);
            display_text TEXT;
        BEGIN
            -- If issue is resolved, SLA is complete
            IF issue_status IN ('resolved', 'rejected') THEN
                RETURN jsonb_build_object(
                    'remaining_seconds', 0,
                    'is_breached', FALSE,
                    'status_color', 'green',
                    'display_text', 'Completed'
                );
            END IF;

            -- Calculate remaining time using a timestamp value to match sla_deadline
            remaining_seconds := EXTRACT(EPOCH FROM (sla_deadline - current_ts))::INTEGER;
            is_breached := remaining_seconds < 0;

            -- Determine status color and text
            IF is_breached THEN
                status_color := 'red';
                display_text := 'SLA Breached';
            ELSIF remaining_seconds < 3600 THEN
                status_color := 'red';
                display_text := 'Critical';
            ELSIF remaining_seconds < 7200 THEN
                status_color := 'orange';
                display_text := 'Urgent';
            ELSE
                status_color := 'green';
                display_text := 'On Track';
            END IF;

            RETURN jsonb_build_object(
                'remaining_seconds', remaining_seconds,
                'is_breached', is_breached,
                'status_color', status_color,
                'display_text', display_text
            );
        END;
        $$ LANGUAGE plpgsql;
      `);
    } catch (error) {
      console.error('Error ensuring SLA database functions:', error);
      throw error;
    }
  }

  /**
   * Calculate SLA deadline for a new issue
   */
  static async calculateSLADeadline(categoryId, createdAt = new Date()) {
    try {
      const result = await pool.query(
        'SELECT sla_hours FROM categories WHERE id = $1',
        [categoryId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Category ${categoryId} not found`);
      }
      
      const slaHours = result.rows[0].sla_hours;
      const deadline = new Date(createdAt.getTime() + (slaHours * 60 * 60 * 1000));
      
      return {
        sla_duration_hours: slaHours,
        sla_deadline: deadline
      };
    } catch (error) {
      console.error('Error calculating SLA deadline:', error);
      throw error;
    }
  }

  /**
   * Get SLA status for an issue
   */
  static async getSLAStatus(issueId, dbClient = null) {
    const client = dbClient || pool;
    
    try {
      const result = await client.query(`
        SELECT 
          i.id,
          i.status,
          i.sla_deadline,
          i.sla_duration_hours,
          i.is_sla_breached,
          calculate_sla_status(i.sla_deadline, i.status) as sla_status
        FROM issues i 
        WHERE i.id = $1
      `, [issueId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const issue = result.rows[0];
      const slaStatus = issue.sla_status;
      
      return {
        issue_id: issueId,
        sla_deadline: issue.sla_deadline,
        sla_duration_hours: issue.sla_duration_hours,
        remaining_seconds: slaStatus.remaining_seconds,
        remaining_time_formatted: await this.formatRemainingTime(slaStatus.remaining_seconds),
        is_breached: slaStatus.is_breached,
        status_color: slaStatus.status_color,
        display_text: slaStatus.display_text,
        issue_status: issue.status
      };
    } catch (error) {
      console.error('Error getting SLA status:', error);
      throw error;
    }
  }

  /**
   * Format remaining time in human-readable format
   */
  static async formatRemainingTime(remainingSeconds) {
    if (remainingSeconds <= 0) {
      return 'Overdue';
    }
    
    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0 || days > 0) result += `${hours}h `;
    result += `${minutes}m`;
    
    return result.trim();
  }

  /**
   * Check for SLA breaches and update database
   */
  static async checkSLABreaches() {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Find issues with breached SLAs that haven't been marked as breached
      const breachedIssues = await client.query(`
        UPDATE issues 
        SET is_sla_breached = TRUE,
            updated_at = NOW()
        WHERE sla_deadline < NOW() 
          AND status NOT IN ('resolved', 'rejected')
          AND is_sla_breached = FALSE
        RETURNING id, category_id, sla_deadline, echo_count
      `);
      
      console.log(`Found ${breachedIssues.rows.length} newly breached SLAs`);
      
      // Log breaches for escalation
      for (const issue of breachedIssues.rows) {
        await this.logSLABreach(issue.id, client);
      }
      
      await client.query('COMMIT');
      return breachedIssues.rows;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error checking SLA breaches:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log SLA breach for audit and escalation
   */
  static async logSLABreach(issueId, dbClient = null) {
    const client = dbClient || pool;
    
    try {
      // Insert audit log
      await client.query(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES (NULL, 'SLA_BREACH', 'issue', $1, $2, 'system')
      `, [
        issueId,
        JSON.stringify({
          breach_time: new Date().toISOString(),
          auto_detected: true
        })
      ]);
      
      console.log(`SLA breach logged for issue ${issueId}`);
    } catch (error) {
      console.error('Error logging SLA breach:', error);
      throw error;
    }
  }

  /**
   * Get issues sorted by SLA priority for authorities
   */
  static async getIssuesBySLAPriority(authorityId, filters = {}) {
    try {
      let whereClause = 'WHERE i.status NOT IN (\'resolved\', \'rejected\')';
      let params = [];
      let paramCount = 0;
      
      // Add authority filter
      if (authorityId) {
        paramCount++;
        whereClause += ` AND c.assigned_to = $${paramCount}`;
        params.push(authorityId);
      }
      
      // Add jurisdiction filter if provided
      if (filters.jurisdictionId) {
        paramCount++;
        whereClause += ` AND i.jurisdiction_id = $${paramCount}`;
        params.push(filters.jurisdictionId);
      }
      
      const result = await pool.query(`
        SELECT DISTINCT
          i.id,
          i.status,
          i.echo_count,
          i.first_reported_at,
          i.sla_deadline,
          i.sla_duration_hours,
          i.is_sla_breached,
          cat.name as category_name,
          j.name as jurisdiction_name,
          ST_Y(i.location::geometry) as latitude,
          ST_X(i.location::geometry) as longitude,
          calculate_sla_status(i.sla_deadline, i.status) as sla_status,
          COUNT(c.id) as complaint_count
        FROM issues i
        JOIN categories cat ON i.category_id = cat.id
        LEFT JOIN jurisdictions j ON i.jurisdiction_id = j.id
        LEFT JOIN complaints c ON c.issue_id = i.id
        ${whereClause}
        GROUP BY i.id, cat.name, j.name
        ORDER BY 
          i.is_sla_breached DESC,
          (i.sla_deadline < NOW()) DESC,
          i.sla_deadline ASC,
          i.echo_count DESC
      `, params);
      
      // Format the results with SLA information
      const formattedIssues = result.rows.map(issue => {
        const slaStatus = issue.sla_status;
        return {
          ...issue,
          remaining_seconds: slaStatus.remaining_seconds,
          remaining_time_formatted: slaStatus.remaining_seconds > 0 
            ? this.formatRemainingTimeSync(slaStatus.remaining_seconds)
            : 'Overdue',
          status_color: slaStatus.status_color,
          sla_display_text: slaStatus.display_text,
          priority_score: this.calculatePriorityScore(issue, slaStatus)
        };
      });
      
      return formattedIssues;
    } catch (error) {
      console.error('Error getting issues by SLA priority:', error);
      throw error;
    }
  }

  /**
   * Calculate priority score for sorting (higher = more urgent)
   */
  static calculatePriorityScore(issue, slaStatus) {
    let score = 0;
    
    // SLA breached gets highest priority
    if (slaStatus.is_breached) score += 1000;
    
    // Critical/urgent status
    if (slaStatus.status_color === 'red') score += 500;
    else if (slaStatus.status_color === 'orange') score += 250;
    
    // Echo count (more reports = higher priority)
    score += issue.echo_count * 10;
    
    // Time factor (closer to deadline = higher priority)
    if (slaStatus.remaining_seconds > 0) {
      score += Math.max(0, 100 - (slaStatus.remaining_seconds / 3600)); // Hours remaining
    }
    
    return score;
  }

  /**
   * Synchronous version of formatRemainingTime for mapping operations
   */
  static formatRemainingTimeSync(remainingSeconds) {
    if (remainingSeconds <= 0) {
      return 'Overdue';
    }
    
    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0 || days > 0) result += `${hours}h `;
    result += `${minutes}m`;
    
    return result.trim();
  }

  /**
   * Update issue SLA when status changes
   */
  static async updateIssueSLA(issueId, newStatus, dbClient = null) {
    const client = dbClient || pool;
    
    try {
      // If issue is resolved or rejected, stop SLA tracking
      if (newStatus === 'resolved' || newStatus === 'rejected') {
        await client.query(`
          UPDATE issues 
          SET is_sla_breached = FALSE,
              updated_at = NOW()
          WHERE id = $1
        `, [issueId]);
        
        console.log(`SLA tracking stopped for resolved/rejected issue ${issueId}`);
      }
    } catch (error) {
      console.error('Error updating issue SLA:', error);
      throw error;
    }
  }

  /**
   * Get SLA statistics for admin dashboard
   */
  static async getSLAStatistics() {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_active_issues,
          COUNT(CASE WHEN is_sla_breached = TRUE THEN 1 END) as breached_issues,
          COUNT(CASE WHEN sla_deadline < NOW() + INTERVAL '2 hours' 
                     AND status NOT IN ('resolved', 'rejected') 
                     AND is_sla_breached = FALSE THEN 1 END) as critical_issues,
          AVG(CASE WHEN status = 'resolved' 
                   THEN EXTRACT(EPOCH FROM (resolved_at - first_reported_at)) / 3600 
                   END) as avg_resolution_hours,
          COUNT(CASE WHEN status = 'resolved' 
                     AND resolved_at <= sla_deadline THEN 1 END) as resolved_within_sla,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as total_resolved
        FROM issues 
        WHERE first_reported_at >= NOW() - INTERVAL '30 days'
      `);
      
      const stats = result.rows[0];
      const slaCompliance = stats.total_resolved > 0 
        ? ((stats.resolved_within_sla / stats.total_resolved) * 100).toFixed(1)
        : 0;
      
      return {
        total_active_issues: parseInt(stats.total_active_issues),
        breached_issues: parseInt(stats.breached_issues),
        critical_issues: parseInt(stats.critical_issues),
        avg_resolution_hours: parseFloat(stats.avg_resolution_hours || 0).toFixed(1),
        sla_compliance_percentage: parseFloat(slaCompliance),
        resolved_within_sla: parseInt(stats.resolved_within_sla),
        total_resolved: parseInt(stats.total_resolved)
      };
    } catch (error) {
      console.error('Error getting SLA statistics:', error);
      throw error;
    }
  }
}

module.exports = SLAService;
