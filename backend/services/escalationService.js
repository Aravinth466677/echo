const pool = require('../config/database');
const { escalateComplaint } = require('./complaintRoutingService');

/**
 * Escalation Scheduler
 * Runs periodically to check and escalate stale complaints
 */

/**
 * Check for complaints that need escalation based on time and priority
 */
async function checkAndEscalateComplaints() {
  try {
    console.log('Running escalation check...');
    
    // Find complaints that need escalation based on priority and time
    const staleComplaints = await pool.query(
      `SELECT c.id, COALESCE(c.assigned_authority_id, c.assigned_to) as assigned_authority_id,
              c.category_id, c.escalation_level,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.created_at))/3600 as hours_old,
              COALESCE(i.echo_count, 1) as echo_count
       FROM complaints c
       LEFT JOIN issues i ON c.issue_id = i.id
       WHERE c.status IN ('submitted', 'assigned', 'escalated')
       AND c.escalation_level < 2
       AND COALESCE(c.assigned_authority_id, c.assigned_to) IS NOT NULL
       AND (
         -- High priority (echo_count >= 10): escalate after 12 hours
         (COALESCE(i.echo_count, 1) >= 10 AND c.created_at < CURRENT_TIMESTAMP - INTERVAL '12 hours')
         OR
         -- Medium priority (echo_count >= 5): escalate after 24 hours
         (COALESCE(i.echo_count, 1) >= 5 AND COALESCE(i.echo_count, 1) < 10 AND c.created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours')
         OR
         -- Normal priority: escalate after 48 hours
         (COALESCE(i.echo_count, 1) < 5 AND c.created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours')
       )
       ORDER BY 
         CASE 
           WHEN COALESCE(i.echo_count, 1) >= 10 THEN 1
           WHEN COALESCE(i.echo_count, 1) >= 5 THEN 2
           ELSE 3
         END,
         c.created_at ASC`
    );
    
    console.log(`Found ${staleComplaints.rows.length} complaints to escalate`);
    
    let escalatedCount = 0;
    
    for (const complaint of staleComplaints.rows) {
      const priority = complaint.echo_count >= 10 ? 'high' : complaint.echo_count >= 5 ? 'medium' : 'normal';
      const success = await escalateComplaint(
        complaint.id,
        `Auto-escalation (${priority} priority): ${Math.floor(complaint.hours_old)} hours without action`
      );
      
      if (success) escalatedCount++;
    }
    
    console.log(`Escalated ${escalatedCount} complaints`);
    return escalatedCount;
  } catch (error) {
    console.error('Escalation check error:', error);
    return 0;
  }
}

/**
 * Start escalation scheduler (runs every hour)
 */
function startEscalationScheduler() {
  // Run immediately on start
  checkAndEscalateComplaints();
  
  // Then run every hour
  const HOUR_IN_MS = 60 * 60 * 1000;
  setInterval(checkAndEscalateComplaints, HOUR_IN_MS);
  
  console.log('Escalation scheduler started (runs every hour)');
}

module.exports = {
  checkAndEscalateComplaints,
  startEscalationScheduler
};
