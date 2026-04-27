class ValidationUtils {
  static formatValidationResponse(validationResults) {
    return {
      success: validationResults.overall.canProceed,
      validation_status: validationResults.overall.status,
      message: validationResults.overall.message,
      complaint_id: null, // Set after complaint creation
      duplicate_of: validationResults.overall.duplicateOf || null,
      confidence: validationResults.overall.confidence,
      details: {
        image: {
          hash: validationResults.image?.hash,
          isDuplicate: validationResults.image?.isDuplicate,
          similarImages: validationResults.image?.similarImages?.length || 0
        },
        location: {
          confidence: validationResults.location?.confidence,
          isValid: validationResults.location?.isValid,
          hasGPS: validationResults.metadata?.summary?.hasGPS
        },
        metadata: {
          hasTimestamp: validationResults.metadata?.summary?.hasTimestamp,
          timestampValid: validationResults.metadata?.summary?.timestampValid,
          locationValid: validationResults.metadata?.summary?.locationValid
        },
        duplicate: {
          hasDuplicates: validationResults.duplicate?.duplicateCheck?.hasDuplicates,
          nearbyCount: validationResults.duplicate?.duplicateCheck?.nearbyComplaints?.length || 0
        }
      }
    };
  }

  static getValidationStatusColor(status) {
    switch (status) {
      case 'VALID': return 'green';
      case 'SUSPECTED': return 'orange';
      case 'LOW_CONFIDENCE': return 'yellow';
      case 'DUPLICATE': return 'red';
      default: return 'gray';
    }
  }

  static getConfidenceLevel(confidence) {
    switch (confidence) {
      case 'HIGH': return 3;
      case 'MEDIUM': return 2;
      case 'LOW': return 1;
      default: return 0;
    }
  }

  static shouldFlagForReview(validationResults) {
    const { status, confidence } = validationResults.overall;
    
    return status === 'SUSPECTED' || 
           status === 'LOW_CONFIDENCE' || 
           confidence === 'LOW' ||
           (validationResults.image?.similarImages?.length > 0);
  }

  static generateValidationSummary(validationResults) {
    const checks = [];
    
    if (validationResults.image?.isDuplicate) {
      checks.push('❌ Duplicate image detected');
    } else if (validationResults.image?.similarImages?.length > 0) {
      checks.push(`⚠️ ${validationResults.image.similarImages.length} similar images found`);
    } else {
      checks.push('✅ Image validation passed');
    }

    if (validationResults.location?.isValid) {
      checks.push(`✅ Location valid (${validationResults.location.confidence} confidence)`);
    } else {
      checks.push('❌ Location validation failed');
    }

    if (validationResults.metadata?.summary?.timestampValid) {
      checks.push('✅ Image timestamp valid');
    } else if (validationResults.metadata?.summary?.hasTimestamp) {
      checks.push('⚠️ Image timestamp issues');
    } else {
      checks.push('ℹ️ No timestamp in image');
    }

    if (validationResults.duplicate?.isDuplicate) {
      checks.push('❌ Duplicate complaint detected');
    } else if (validationResults.duplicate?.duplicateCheck?.hasDuplicates) {
      checks.push(`ℹ️ ${validationResults.duplicate.duplicateCheck.nearbyComplaints.length} nearby complaints found`);
    } else {
      checks.push('✅ No duplicates found');
    }

    return checks;
  }
}

module.exports = ValidationUtils;