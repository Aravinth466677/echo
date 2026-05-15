const pool = require('../config/database');
const { escalateComplaint } = require('./complaintRoutingService');

/**
 * Escalation Scheduler
 * Runs periodically to check and escalate stale complaints
 */

/**
 * Check for complaints that need escalation based on SLA timeouts
 */
async function checkAndEscalateComplaints() {
  try {
    console.log('Running SLA escalation check...');
    
    // Find complaints that exceed their category SLA and need escalation
    const staleComplaints = await pool.query(
      `SELECT c.id, COALESCE(c.assigned_authority_id, c.assigned_to) as assigned_authority_id,
              c.category_id, c.escalation_level, cat.name as category_name, cat.sla_hours,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.created_at))/3600 as hours_old,
              i.status as issue_status
       FROM complaints c
       LEFT JOIN issues i ON c.issue_id = i.id
       JOIN categories cat ON c.category_id = cat.id
       WHERE c.status IN ('submitted', 'assigned')
       AND i.status IN ('pending', 'verified')
       AND c.escalation_level < 2
       AND COALESCE(c.assigned_authority_id, c.assigned_to) IS NOT NULL
       AND EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.created_at))/3600 > cat.sla_hours
       ORDER BY c.created_at ASC`
    );
    
    console.log(`Found ${staleComplaints.rows.length} complaints exceeding SLA`);
    
    let escalatedCount = 0;
    
    for (const complaint of staleComplaints.rows) {
      const success = await escalateComplaint(
        complaint.id,
        `SLA escalation: ${complaint.category_name} exceeded ${complaint.sla_hours}h limit (${Math.floor(complaint.hours_old)}h old)`
      );
      
      if (success) {
        console.log(`Escalated complaint ${complaint.id} (${complaint.category_name}, ${Math.floor(complaint.hours_old)}h old)`);
        escalatedCount++;
      }
    }
    
    console.log(`Escalated ${escalatedCount} complaints due to SLA breach`);
    return escalatedCount;
  } catch (error) {
    console.error('SLA escalation check error:', error);
    return 0;
  }
}

/**
 * Start SLA escalation scheduler (runs every hour)
 */
function startEscalationScheduler() {
  // Run immediately on start
  checkAndEscalateComplaints();
  
  // Then run every hour to check SLA breaches
  const HOUR_IN_MS = 60 * 60 * 1000;
  setInterval(checkAndEscalateComplaints, HOUR_IN_MS);
  
  console.log('SLA escalation scheduler started (runs every hour)');
}

module.exports = {
  checkAndEscalateComplaints,
  startEscalationScheduler
};
