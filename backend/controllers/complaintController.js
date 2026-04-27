const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');
const { findMatchingIssue, createNewIssue, linkComplaintToIssue } = require('../services/aggregationService');
const { assignJurisdiction } = require('./jurisdictionController');
const { routeComplaint } = require('../services/complaintRoutingService');
const { logComplaintRouting } = require('../services/routingLoggerService');
const SLAService = require('../services/slaService');
const RemoteReportingService = require('../services/remoteReportingService');
const ValidationPipelineService = require('../services/validationPipelineService');
const { maskPhoneNumber } = require('../utils/phoneUtils');
const mergedComplaintsService = require('../services/mergedComplaintsService');
const path = require('path');

const submitComplaint = async (req, res) => {
  const {
    categoryId,
    latitude,
    longitude,
    reporterLatitude,
    reporterLongitude,
    description,
    evidenceType,
    wardId,
    reportMode,
    justification,
    justificationType,
    locationVerificationStatus = 'verified'
  } = req.body;
  const userId = req.user.id;
  const evidenceUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const normalizedDescription = String(description || '').trim();
  const normalizedJustification = String(justification || '').trim();
  let transactionCommitted = false;

  console.log('=== COMPLAINT SUBMISSION ===');
  console.log(`User: ${userId}, Category: ${categoryId}`);

  if (!evidenceUrl) {
    return res.status(400).json({ error: 'An image is required for every report.' });
  }

  if (!req.file.mimetype?.startsWith('image/')) {
    return res.status(400).json({ error: 'Only image uploads are allowed.' });
  }

  const remoteValidation = RemoteReportingService.validateForSubmit({
    reportMode,
    issueLatitude: latitude,
    issueLongitude: longitude,
    reporterLatitude,
    reporterLongitude,
    description: normalizedDescription,
    justification: normalizedJustification
  });

  if (!remoteValidation.valid) {
    return res.status(400).json({
      error: remoteValidation.message,
      validation: remoteValidation
    });
  }

  const lat = remoteValidation.issueLocation.lat;
  const lon = remoteValidation.issueLocation.lng;
  const reporterLat = remoteValidation.reporterLocation.lat;
  const reporterLon = remoteValidation.reporterLocation.lng;

  console.log(`Issue location: ${lat}, ${lon}`);
  console.log(`Reporter location: ${reporterLat}, ${reporterLon}`);
  console.log(`Report mode: ${remoteValidation.reportMode}, trust: ${remoteValidation.trustLevel}`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    let routing = null;

    // === VALIDATION PIPELINE ===
    console.log('Starting validation pipeline...');
    const imagePath = path.join(__dirname, '..', req.file.path);
    
    const validationResults = await ValidationPipelineService.validateComplaint({
      imagePath,
      categoryId,
      latitude: lat,
      longitude: lon,
      reporterLatitude: reporterLat,
      reporterLongitude: reporterLon,
      userId,
      gpsAccuracy: req.body.gpsAccuracy || null,
      isManualSelection: req.body.isManualSelection === 'true'
    }, client);

    console.log('Validation results:', {
      status: validationResults.overall.status,
      confidence: validationResults.overall.confidence,
      canProceed: validationResults.overall.canProceed
    });

    // Block submission if validation failed
    if (!validationResults.overall.canProceed) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation failed',
        message: validationResults.overall.message,
        validation: {
          status: validationResults.overall.status,
          confidence: validationResults.overall.confidence,
          duplicateOf: validationResults.overall.duplicateOf
        }
      });
    }

    // Assign jurisdiction
    const jurisdictionId = await assignJurisdiction(lon, lat, client);
    console.log(`Jurisdiction: ${jurisdictionId || 'None'}`);

    // Use validation results for issue matching if available
    let isDuplicate = false;
    let issueId = null;
    
    if (validationResults.overall.shouldLink && validationResults.overall.linkToIssueId) {
      issueId = validationResults.overall.linkToIssueId;
      console.log(`Linking to existing issue from validation: ${issueId}`);
    } else {
      // Find matching issue using existing logic
      const matchResult = await findMatchingIssue(categoryId, lat, lon, userId, client);
      isDuplicate = matchResult.isDuplicate;
      issueId = matchResult.issueId;
    }

    if (isDuplicate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You have already reported this issue' });
    }

    let finalIssueId = issueId;
    let isPrimary = false;

    // Create new issue if no match
    if (!finalIssueId) {
      finalIssueId = await createNewIssue(categoryId, lat, lon, wardId, jurisdictionId, client);
      isPrimary = true;
      console.log(`New issue created: ${finalIssueId}`);
    } else {
      await linkComplaintToIssue(finalIssueId, client);
      console.log(`Linked to existing issue: ${finalIssueId}`);
    }

    // Insert complaint with validation results
    const complaintResult = await client.query(
      `INSERT INTO complaints (
        issue_id, user_id, category_id,
        location, latitude, longitude,
        reporter_location, reporter_latitude, reporter_longitude,
        report_mode, distance_meters, trust_level,
        remote_justification, justification_type, location_verification_status,
        evidence_url, evidence_type, description, is_primary, status, jurisdiction_id,
        image_hash, validation_status, location_confidence, metadata_validation
      )
       VALUES (
        $1, $2, $3,
        ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $5, $4,
        ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, $7, $6,
        $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16, $17, 'submitted', $18,
        $19, $20, $21, $22
      )
       RETURNING id`,
      [
        finalIssueId,
        userId,
        categoryId,
        lon,
        lat,
        reporterLon,
        reporterLat,
        remoteValidation.reportMode,
        remoteValidation.distance,
        remoteValidation.trustLevel,
        normalizedJustification || null,
        justificationType || null,
        locationVerificationStatus,
        evidenceUrl,
        evidenceType,
        normalizedDescription,
        isPrimary,
        jurisdictionId,
        validationResults.image?.hash || null,
        validationResults.overall.status,
        validationResults.overall.confidence,
        JSON.stringify({
          validationResults,
          validatedAt: new Date().toISOString()
        })
      ]
    );

    const complaintId = complaintResult.rows[0]?.id;

    if (!complaintId) {
      throw new Error('Complaint insert failed');
    }

    console.log(`Complaint created: ${complaintId}`);

    // Store image hash for future duplicate detection
    if (validationResults.image?.hash) {
      const ImageValidationService = require('../services/imageValidationService');
      await ImageValidationService.storeImageHash(complaintId, validationResults.image.hash, client);
    }

    // Get current echo count for routing
    const echoResult = await client.query('SELECT echo_count FROM issues WHERE id = $1', [finalIssueId]);
    const currentEchoCount = echoResult.rows[0]?.echo_count || 1;
    console.log(`Issue: ${finalIssueId} (isPrimary: ${isPrimary})`);
    console.log(`Echo count: ${currentEchoCount}`);

    // Route complaint to authority
    try {
      routing = await routeComplaint(complaintId, categoryId, lon, lat, {
        dbClient: client,
        jurisdictionId,
        issueId: finalIssueId,
        echoCount: currentEchoCount
      });
      
      if (routing) {
        console.log(`Routed to: ${routing.authorityLevel} (${routing.authorityEmail}) - echo_count: ${currentEchoCount}`);
        
        // Log the routing decision
        const categoryResult = await client.query('SELECT name FROM categories WHERE id = $1', [categoryId]);
        const jurisdictionResult = jurisdictionId
          ? await client.query('SELECT name FROM jurisdictions WHERE id = $1', [jurisdictionId])
          : { rows: [{ name: null }] };
        const authorityResult = await client.query('SELECT full_name, email FROM authorities WHERE id = $1', [
          routing.authorityId
        ]);

        await logComplaintRouting(
          {
            complaintId,
            issueId: finalIssueId,
            routedToUserId: routing.authorityId,
            authorityLevel: routing.authorityLevel,
            authorityEmail: authorityResult.rows[0]?.email,
            authorityName: authorityResult.rows[0]?.full_name,
            jurisdictionId,
            jurisdictionName: jurisdictionResult.rows[0]?.name,
            categoryId,
            categoryName: categoryResult.rows[0]?.name,
            routingReason: routing.routingReason,
            echoCount: currentEchoCount,
            additionalDetails: {
              coordinates: { latitude: lat, longitude: lon },
              reporterCoordinates: { latitude: reporterLat, longitude: reporterLon },
              isPrimary,
              submittedBy: userId,
              reportMode: remoteValidation.reportMode,
              trustLevel: remoteValidation.trustLevel,
              distance: remoteValidation.distance
            }
          },
          client
        );
      } else {
        console.error('Routing returned null - no authority found');
      }

      await auditLog(
        userId,
        'COMPLAINT_SUBMITTED',
        'complaint',
        complaintId,
        {
          issueId: finalIssueId,
          categoryId,
          isPrimary,
          assignedTo: routing?.authorityId,
          reportMode: remoteValidation.reportMode,
          trustLevel: remoteValidation.trustLevel,
          distance: remoteValidation.distance
        },
        req.ip
      );
    } catch (routingError) {
      console.error('Routing error:', routingError);
      console.error('Routing error stack:', routingError.stack);
      // Continue even if routing fails but log the full error
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    console.log('Complaint submitted successfully');

    res.status(201).json({
      message: 'Complaint submitted successfully',
      complaintId,
      issueId: finalIssueId,
      isNewIssue: isPrimary,
      routing,
      validation: {
        status: validationResults.overall.status,
        confidence: validationResults.overall.confidence,
        message: validationResults.overall.message,
        imageHash: validationResults.image?.hash,
        locationConfidence: validationResults.overall.confidence
      },
      remoteReporting: {
        reportMode: remoteValidation.reportMode,
        reporterLocation: remoteValidation.reporterLocation,
        issueLocation: remoteValidation.issueLocation,
        distance: remoteValidation.distance,
        distanceFormatted: RemoteReportingService.formatDistance(remoteValidation.distance),
        trustLevel: remoteValidation.trustLevel,
        justification: normalizedJustification
      }
    });
  } catch (error) {
    if (!transactionCommitted) {
      await client.query('ROLLBACK');
    }

    console.error('Submit complaint error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to submit complaint', details: error.message });
  } finally {
    client.release();
  }
};

const getMyComplaints = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT c.id, c.created_at, c.description, c.evidence_url, c.status,
              c.routing_reason, c.assigned_to, c.assigned_authority_id,
              cat.name as category_name,
              i.id as issue_id, i.status as issue_status, i.echo_count,
              i.sla_deadline, i.sla_duration_hours, i.is_sla_breached,
              c.latitude, c.longitude,
              c.report_mode, c.reporter_latitude, c.reporter_longitude,
              c.distance_meters, c.trust_level, c.remote_justification,
              c.justification_type, c.location_verification_status,
              j.name as jurisdiction_name,
              a.full_name as authority_name,
              a.authority_level
       FROM complaints c
       JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN issues i ON c.issue_id = i.id
       LEFT JOIN jurisdictions j ON c.jurisdiction_id = j.id
       LEFT JOIN authorities a ON c.assigned_authority_id = a.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    // Add SLA status for each complaint's issue
    const complaintsWithSLA = await Promise.all(
      result.rows.map(async (complaint) => {
        if (complaint.issue_id) {
          const slaStatus = await SLAService.getSLAStatus(complaint.issue_id);
          return {
            ...complaint,
            sla_status: slaStatus
          };
        }
        return complaint;
      })
    );

    res.json({ complaints: complaintsWithSLA });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
};

const getComplaintRoutingHistory = async (req, res) => {
  const { complaintId } = req.params;
  const userId = req.user.id;

  try {
    // Verify complaint belongs to user
    const ownershipCheck = await pool.query('SELECT id FROM complaints WHERE id = $1 AND user_id = $2', [
      complaintId,
      userId
    ]);

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found or access denied' });
    }

    // Get current assignment info
    const assignmentResult = await pool.query(
      `SELECT c.assigned_authority_id, a.full_name, a.email, a.authority_level
       FROM complaints c
       LEFT JOIN authorities a ON c.assigned_authority_id = a.id
       WHERE c.id = $1`,
      [complaintId]
    );
    
    const currentAssignment = assignmentResult.rows[0] || {};

    const { getComplaintRoutingHistory } = require('../services/routingLoggerService');
    const routingHistory = await getComplaintRoutingHistory(complaintId);

    res.json({
      complaintId: parseInt(complaintId, 10),
      currentAssignment: {
        authorityId: currentAssignment.assigned_authority_id,
        authorityName: currentAssignment.full_name,
        authorityLevel: currentAssignment.authority_level
      },
      routingHistory: routingHistory.map((log) => ({
        id: log.id,
        routedAt: log.routed_at,
        authorityLevel: log.authority_level,
        authorityName: log.authority_full_name || log.authority_name,
        jurisdictionName: log.jurisdiction_name,
        categoryName: log.category_name,
        routingReason: log.routing_reason,
        echoCount: log.echo_count,
        details: log.routing_details
      }))
    });
  } catch (error) {
    console.error('Get routing history error:', error);
    res.status(500).json({ error: 'Failed to fetch routing history' });
  }
};

const getAreaIssues = async (req, res) => {
  const { latitude, longitude, radius = 5000 } = req.query;

  try {
    const result = await pool.query(
      `SELECT i.id, i.echo_count, i.status, i.first_reported_at,
              i.sla_deadline, i.sla_duration_hours, i.is_sla_breached,
              cat.name as category_name,
              ST_Y(i.location::geometry) as latitude,
              ST_X(i.location::geometry) as longitude,
              COUNT(c.id) as report_count
       FROM issues i
       JOIN categories cat ON i.category_id = cat.id
       LEFT JOIN complaints c ON c.issue_id = i.id
       WHERE ST_DWithin(
         i.location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       AND i.status NOT IN ('rejected')
       GROUP BY i.id, cat.name
       ORDER BY i.echo_count DESC, i.first_reported_at DESC
       LIMIT 50`,
      [longitude, latitude, radius]
    );

    // Add SLA status for each issue
    const issuesWithSLA = await Promise.all(
      result.rows.map(async (issue) => {
        const slaStatus = await SLAService.getSLAStatus(issue.id);
        return {
          ...issue,
          sla_status: slaStatus
        };
      })
    );

    res.json({ issues: issuesWithSLA });
  } catch (error) {
    console.error('Get area issues error:', error);
    res.status(500).json({ error: 'Failed to fetch area issues' });
  }
};

const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, description FROM categories ORDER BY name');
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

const validateRemoteReport = async (req, res) => {
  const validation = RemoteReportingService.buildValidation({
    reportMode: 'remote',
    issueLatitude: req.body.issueLatitude,
    issueLongitude: req.body.issueLongitude,
    reporterLatitude: req.body.reporterLatitude,
    reporterLongitude: req.body.reporterLongitude
  });

  if (!validation.valid) {
    return res.status(400).json({
      error: validation.message,
      validation
    });
  }

  res.json({
    validation,
    distanceFormatted: RemoteReportingService.formatDistance(validation.distance)
  });
};

const getJustificationOptions = async (req, res) => {
  res.json({ options: RemoteReportingService.getJustificationOptions() });
};

const getUserReportingStats = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS daily_reports,
         COUNT(CASE WHEN report_mode = 'remote' THEN 1 END)::int AS daily_remote_reports,
         COUNT(CASE WHEN trust_level = 'low' THEN 1 END)::int AS daily_low_trust
       FROM complaints
       WHERE user_id = $1
         AND created_at::date = CURRENT_DATE`,
      [req.user.id]
    );

    const stats = result.rows[0] || {
      daily_reports: 0,
      daily_remote_reports: 0,
      daily_low_trust: 0
    };

    res.json({
      stats: {
        ...stats,
        daily_limit: 10,
        low_trust_limit: 3
      }
    });
  } catch (error) {
    console.error('Get user reporting stats error:', error);
    res.status(500).json({ error: 'Failed to fetch reporting stats' });
  }
};

// Get complaint details with masked phone (for authorities)
const getComplaintDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    
    // Only authorities and admins can view complaint details
    if (!['authority', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Access denied. Authority role required.' 
      });
    }
    
    const query = `
      SELECT 
        c.id,
        c.description,
        c.evidence_url,
        c.evidence_type,
        c.latitude,
        c.longitude,
        c.status,
        c.created_at,
        c.report_mode,
        c.trust_level,
        c.distance_meters,
        cat.name as category_name,
        u.full_name as reporter_name,
        u.email as reporter_email,
        u.phone as reporter_phone,
        i.echo_count,
        i.status as issue_status,
        j.name as jurisdiction_name
      FROM complaints c
      JOIN users u ON c.user_id = u.id
      JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN issues i ON c.issue_id = i.id
      LEFT JOIN jurisdictions j ON c.jurisdiction_id = j.id
      WHERE c.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    const complaint = result.rows[0];
    
    // Mask phone number for security
    const maskedPhone = maskPhoneNumber(complaint.reporter_phone);
    
    res.json({
      success: true,
      complaint: {
        id: complaint.id,
        description: complaint.description,
        evidence_url: complaint.evidence_url,
        evidence_type: complaint.evidence_type,
        location: {
          latitude: complaint.latitude,
          longitude: complaint.longitude
        },
        status: complaint.status,
        created_at: complaint.created_at,
        category_name: complaint.category_name,
        jurisdiction_name: complaint.jurisdiction_name,
        report_mode: complaint.report_mode,
        trust_level: complaint.trust_level,
        distance_meters: complaint.distance_meters,
        reporter: {
          name: complaint.reporter_name,
          email: complaint.reporter_email,
          phone_masked: maskedPhone,
          verification_status: 'Verified User'
        },
        issue: {
          echo_count: complaint.echo_count,
          status: complaint.issue_status
        }
      }
    });
    
  } catch (error) {
    console.error('Get complaint details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get full contact information (restricted endpoint)
const getComplaintContact = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    
    // Strict role check - only authorities and admins
    if (!['authority', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Access denied. Authority or Admin role required.' 
      });
    }
    
    const query = `
      SELECT 
        u.full_name,
        u.email,
        u.phone,
        c.created_at,
        c.description,
        c.report_mode,
        c.trust_level,
        cat.name as category_name
      FROM complaints c
      JOIN users u ON c.user_id = u.id
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    
    const contact = result.rows[0];
    
    // Log access for audit trail
    await auditLog(
      req.user.id,
      'CONTACT_INFO_ACCESSED',
      'complaint',
      id,
      { 
        accessed_by: req.user.email,
        contact_phone: contact.phone ? 'YES' : 'NO',
        reporter_name: contact.full_name
      },
      req.ip
    );
    
    res.json({
      success: true,
      contact: {
        name: contact.full_name,
        email: contact.email,
        phone: contact.phone || 'Not provided',
        complaint_date: contact.created_at,
        complaint_summary: contact.description?.substring(0, 100) + '...',
        category: contact.category_name,
        report_mode: contact.report_mode,
        trust_level: contact.trust_level
      },
      warning: 'This information is confidential. Use only for official purposes.'
    });
    
  } catch (error) {
    console.error('Get complaint contact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get merged issue details for authorities
const getIssueDetails = async (req, res) => {
  try {
    const { issueId } = req.params;
    const userRole = req.user.role;
    
    if (!['authority', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Access denied. Authority role required.' 
      });
    }
    
    const reporters = await mergedComplaintsService.getIssueReporters(issueId);
    
    if (reporters.totalReports === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    // Get issue details
    const issueQuery = `
      SELECT 
        i.id,
        i.status,
        i.echo_count,
        i.first_reported_at,
        i.last_reported_at,
        i.verified_at,
        i.resolved_at,
        cat.name as category_name,
        ST_Y(i.location::geometry) as latitude,
        ST_X(i.location::geometry) as longitude
      FROM issues i
      JOIN categories cat ON i.category_id = cat.id
      WHERE i.id = $1
    `;
    
    const issueResult = await pool.query(issueQuery, [issueId]);
    
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const issue = issueResult.rows[0];
    
    res.json({
      success: true,
      issue: {
        id: issue.id,
        status: issue.status,
        echoCount: issue.echo_count,
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
        reporters: {
          totalReports: reporters.totalReports,
          primaryReporter: reporters.primaryReporter,
          additionalReporters: reporters.additionalReporters
        }
      }
    });
    
  } catch (error) {
    console.error('Get issue details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all reporters contact info (restricted)
const getIssueContacts = async (req, res) => {
  try {
    const { issueId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;
    
    const contacts = await mergedComplaintsService.getAllReportersContact(
      issueId, 
      userId, 
      userRole
    );
    
    res.json({
      success: true,
      ...contacts
    });
    
  } catch (error) {
    console.error('Get issue contacts error:', error);
    
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ error: error.message });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get authority issues view with merged complaints
const getAuthorityIssues = async (req, res) => {
  try {
    const { status } = req.query;
    const authorityId = req.user.id;
    const userRole = req.user.role;
    
    if (!['authority', 'admin'].includes(userRole)) {
      return res.status(403).json({ 
        error: 'Access denied. Authority role required.' 
      });
    }
    
    const issues = await mergedComplaintsService.getAuthorityIssuesView(
      authorityId, 
      status
    );
    
    res.json({
      success: true,
      issues,
      totalCount: issues.length
    });
    
  } catch (error) {
    console.error('Get authority issues error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  submitComplaint,
  getMyComplaints,
  getComplaintRoutingHistory,
  getAreaIssues,
  getCategories,
  validateRemoteReport,
  getJustificationOptions,
  getUserReportingStats,
  getComplaintDetails,
  getComplaintContact,
  getIssueDetails,
  getIssueContacts,
  getAuthorityIssues
};
