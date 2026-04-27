const cron = require('node-cron');
const SLAService = require('./slaService');

/**
 * SLA Monitor - Background scheduler for SLA tracking and enforcement
 */
class SLAMonitor {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }

  /**
   * Start all SLA monitoring jobs
   */
  start() {
    if (this.isRunning) {
      console.log('SLA Monitor is already running');
      return;
    }

    console.log('Starting SLA Monitor...');
    
    // Check for SLA breaches every 5 minutes
    const breachCheckJob = cron.schedule('*/5 * * * *', async () => {
      try {
        console.log('Running SLA breach check...');
        const breachedIssues = await SLAService.checkSLABreaches();
        
        if (breachedIssues.length > 0) {
          console.log(`Found ${breachedIssues.length} newly breached SLAs`);
          // Here you could add notification logic (email, SMS, etc.)
          await this.handleSLABreaches(breachedIssues);
        }
      } catch (error) {
        console.error('Error in SLA breach check:', error);
      }
    }, {
      scheduled: false
    });

    // Generate SLA reports every hour
    const reportJob = cron.schedule('0 * * * *', async () => {
      try {
        console.log('Generating SLA statistics...');
        const stats = await SLAService.getSLAStatistics();
        console.log('SLA Stats:', stats);
        
        // Log critical metrics
        if (stats.breached_issues > 0) {
          console.warn(`⚠️  ${stats.breached_issues} issues have breached SLA`);
        }
        
        if (stats.critical_issues > 0) {
          console.warn(`🔥 ${stats.critical_issues} issues are critical (< 2 hours remaining)`);
        }
      } catch (error) {
        console.error('Error generating SLA report:', error);
      }
    }, {
      scheduled: false
    });

    // Start the jobs
    breachCheckJob.start();
    reportJob.start();
    
    this.jobs = [breachCheckJob, reportJob];
    this.isRunning = true;
    
    console.log('✅ SLA Monitor started successfully');
    console.log('- SLA breach check: Every 5 minutes');
    console.log('- SLA reports: Every hour');
  }

  /**
   * Stop all SLA monitoring jobs
   */
  stop() {
    if (!this.isRunning) {
      console.log('SLA Monitor is not running');
      return;
    }

    console.log('Stopping SLA Monitor...');
    
    this.jobs.forEach(job => {
      job.stop();
      job.destroy();
    });
    
    this.jobs = [];
    this.isRunning = false;
    
    console.log('✅ SLA Monitor stopped');
  }

  /**
   * Handle SLA breaches (notifications, escalations, etc.)
   */
  async handleSLABreaches(breachedIssues) {
    for (const issue of breachedIssues) {
      try {
        console.log(`🚨 SLA BREACH: Issue ${issue.id} (Echo: ${issue.echo_count})`);
        
        // Here you could implement:
        // 1. Email notifications to authorities
        // 2. SMS alerts for critical issues
        // 3. Escalation to higher authorities
        // 4. Dashboard notifications
        
        // For now, just log the breach
        await this.logBreachNotification(issue);
        
      } catch (error) {
        console.error(`Error handling SLA breach for issue ${issue.id}:`, error);
      }
    }
  }

  /**
   * Log breach notification (placeholder for actual notification system)
   */
  async logBreachNotification(issue) {
    const breachInfo = {
      issue_id: issue.id,
      category_id: issue.category_id,
      echo_count: issue.echo_count,
      sla_deadline: issue.sla_deadline,
      breach_time: new Date().toISOString(),
      severity: this.calculateBreachSeverity(issue)
    };
    
    console.log('SLA Breach Details:', breachInfo);
    
    // TODO: Implement actual notification logic here
    // - Send email to assigned authority
    // - Send SMS for high-severity breaches
    // - Create dashboard alert
    // - Escalate to supervisor if needed
  }

  /**
   * Calculate breach severity based on issue characteristics
   */
  calculateBreachSeverity(issue) {
    let severity = 'LOW';
    
    // High echo count = high severity
    if (issue.echo_count >= 10) {
      severity = 'CRITICAL';
    } else if (issue.echo_count >= 5) {
      severity = 'HIGH';
    } else if (issue.echo_count >= 3) {
      severity = 'MEDIUM';
    }
    
    // Certain categories are always high priority
    const highPriorityCategories = [4, 5]; // Water Supply, Drainage
    if (highPriorityCategories.includes(issue.category_id)) {
      severity = severity === 'LOW' ? 'MEDIUM' : severity;
    }
    
    return severity;
  }

  /**
   * Get current monitor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.length,
      startTime: this.startTime,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Force run SLA breach check (for testing/manual trigger)
   */
  async forceBreachCheck() {
    try {
      console.log('Manual SLA breach check triggered...');
      const breachedIssues = await SLAService.checkSLABreaches();
      
      if (breachedIssues.length > 0) {
        await this.handleSLABreaches(breachedIssues);
      }
      
      return {
        success: true,
        breachedIssues: breachedIssues.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in manual SLA breach check:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Create singleton instance
const slaMonitor = new SLAMonitor();

module.exports = slaMonitor;