const ImageValidationService = require('./imageValidationService');
const MetadataValidationService = require('./metadataValidationService');
const DuplicateDetectionService = require('./duplicateDetectionService');
const LocationValidationService = require('./locationValidationService');
const EnhancedLocationValidationService = require('./enhancedLocationValidationService');
const pool = require('../config/database');

class ValidationPipelineService {
  static async validateComplaint(validationData, client = null) {
    const {
      imagePath,
      categoryId,
      latitude,
      longitude,
      reporterLatitude,
      reporterLongitude,
      userId,
      gpsAccuracy,
      isManualSelection = false
    } = validationData;

    const validationResults = {
      overall: {
        status: 'VALID',
        confidence: 'MEDIUM',
        canProceed: true,
        message: 'Validation completed successfully'
      },
      image: null,
      metadata: null,
      duplicate: null,
      location: null,
      timestamp: new Date().toISOString()
    };

    try {
      // 1. Image Validation (Perceptual Hash & Duplicate Detection)
      console.log('Running image validation...');
      validationResults.image = await ImageValidationService.validateImage(imagePath);
      
      // 2. Metadata Validation (EXIF data)
      console.log('Running metadata validation...');
      validationResults.metadata = await MetadataValidationService.validateMetadata(
        imagePath, latitude, longitude
      );

      // 3. Enhanced Location Validation (smarter GPS assessment)
      console.log('Running enhanced location validation...');
      validationResults.location = EnhancedLocationValidationService.smartLocationValidation({
        latitude,
        longitude,
        accuracy: gpsAccuracy,
        reporterLatitude,
        reporterLongitude,
        isManualSelection,
        context: {
          timestamp: new Date().toISOString(),
          // Add more context as available from frontend
        }
      });

      // 4. Spatial Duplicate Detection
      console.log('Running duplicate detection...');
      validationResults.duplicate = await DuplicateDetectionService.validateDuplicateSubmission(
        categoryId, latitude, longitude, userId, client
      );

      // 5. Determine Overall Status
      const overallStatus = this.determineOverallStatus(validationResults);
      validationResults.overall = overallStatus;

      console.log(`Validation completed: ${overallStatus.status} (${overallStatus.confidence})`);
      
      return validationResults;
    } catch (error) {
      console.error('Validation pipeline error:', error);
      return {
        overall: {
          status: 'VALID',
          confidence: 'LOW',
          canProceed: true,
          message: 'Validation failed but allowing submission',
          error: error.message
        },
        image: null,
        metadata: null,
        duplicate: null,
        location: null,
        timestamp: new Date().toISOString()
      };
    }
  }

  static determineOverallStatus(results) {
    const { image, metadata, duplicate, location } = results;

    // Block if user already reported this issue
    if (duplicate?.isDuplicate && duplicate?.reason === 'USER_ALREADY_REPORTED') {
      return {
        status: 'DUPLICATE',
        confidence: 'HIGH',
        canProceed: false,
        message: 'You have already reported this issue',
        duplicateOf: duplicate.existingComplaintId
      };
    }

    // Block if exact image duplicate found
    if (image?.isDuplicate) {
      return {
        status: 'DUPLICATE',
        confidence: 'HIGH',
        canProceed: false,
        message: 'This image has already been submitted',
        duplicateOf: image.duplicateOf
      };
    }

    // Determine status based on validation results
    let status = 'VALID';
    let confidence = 'HIGH';
    let reasons = [];

    // Check image validation
    if (image?.validationStatus === 'SUSPECTED') {
      status = 'SUSPECTED';
      confidence = 'MEDIUM';
      reasons.push('similar_image_found');
    }

    // Check metadata validation
    if (metadata?.validationStatus === 'LOW_CONFIDENCE') {
      if (status === 'VALID') status = 'LOW_CONFIDENCE';
      confidence = 'LOW';
      reasons.push('metadata_issues');
    }

    // Check location validation
    if (!location?.isValid || location?.confidence === 'LOW') {
      if (status === 'VALID') status = 'LOW_CONFIDENCE';
      confidence = 'LOW';
      reasons.push('location_issues');
    }

      // Use the lowest confidence level, but consider smart analysis
      const locationConfidence = validationResults.location?.confidence;
      const metadataConfidence = validationResults.metadata?.locationConfidence;
      const smartAnalysis = validationResults.location?.smartAnalysis;
      
      if (locationConfidence === 'LOW' && !smartAnalysis?.contextualFactors?.length) {
        confidence = 'LOW';
      } else if (locationConfidence === 'LOW' && smartAnalysis?.contextualFactors?.includes('stable_location_pattern')) {
        // Smart analysis suggests location might be better than reported
        confidence = confidence === 'HIGH' ? 'MEDIUM' : confidence;
      } else if (locationConfidence === 'MEDIUM' || metadataConfidence === 'MEDIUM') {
        confidence = confidence === 'HIGH' ? 'MEDIUM' : confidence;
      }

    return {
      status,
      confidence,
      canProceed: true,
      message: this.generateStatusMessage(status, reasons, validationResults.location?.smartAnalysis),
      reasons,
      shouldLink: duplicate?.shouldLink || false,
      linkToComplaintId: duplicate?.linkToComplaintId || null,
      linkToIssueId: duplicate?.linkToIssueId || null,
      smartAnalysis: validationResults.location?.smartAnalysis || null
    };
  }

  static generateStatusMessage(status, reasons, smartAnalysis = null) {
    switch (status) {
      case 'VALID':
        if (smartAnalysis?.recommendation) {
          return `Complaint validation passed. ${smartAnalysis.recommendation}`;
        }
        return 'Complaint validation passed';
      case 'SUSPECTED':
        return 'Complaint flagged for review due to similar content';
      case 'LOW_CONFIDENCE':
        if (smartAnalysis?.recommendation) {
          return `${smartAnalysis.recommendation} Issues: ${reasons.join(', ')}`;
        }
        return `Complaint has low confidence due to: ${reasons.join(', ')}`;
      case 'DUPLICATE':
        return 'Duplicate complaint detected';
      default:
        return 'Complaint validation completed';
    }
  }

  static async storeValidationResults(complaintId, validationResults, imageHash, client = null) {
    const dbClient = client || pool;
    
    try {
      // Update complaint with validation results
      await dbClient.query(
        `UPDATE complaints 
         SET image_hash = $1,
             validation_status = $2,
             location_confidence = $3,
             duplicate_of = $4,
             metadata_validation = $5
         WHERE id = $6`,
        [
          imageHash,
          validationResults.overall.status,
          validationResults.overall.confidence,
          validationResults.overall.duplicateOf || null,
          JSON.stringify({
            validationResults: validationResults,
            validatedAt: new Date().toISOString()
          }),
          complaintId
        ]
      );

      // Store image hash for future duplicate detection
      if (imageHash) {
        await ImageValidationService.storeImageHash(complaintId, imageHash, dbClient);
      }

      console.log(`Validation results stored for complaint ${complaintId}`);
    } catch (error) {
      console.error('Store validation results error:', error);
      throw error;
    }
  }
}

module.exports = ValidationPipelineService;