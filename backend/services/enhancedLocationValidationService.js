class EnhancedLocationValidationService {
  static validateGPSAccuracy(accuracy, additionalContext = {}) {
    const { hasMovement, signalStrength, satelliteCount, timestamp } = additionalContext;
    
    // If no accuracy data, use context clues
    if (!accuracy || accuracy === null || accuracy === undefined) {
      return {
        confidence: 'MEDIUM',
        reason: 'no_accuracy_data',
        isValid: true,
        recommendation: 'Use additional validation methods'
      };
    }

    // Very high accuracy - definitely trust it
    if (accuracy < 5) {
      return {
        confidence: 'HIGH',
        reason: 'very_high_accuracy_gps',
        isValid: true,
        accuracy
      };
    }

    // Good accuracy - trust it
    if (accuracy < 20) {
      return {
        confidence: 'HIGH',
        reason: 'high_accuracy_gps',
        isValid: true,
        accuracy
      };
    }

    // Moderate accuracy - generally trustworthy
    if (accuracy < 100) {
      return {
        confidence: 'MEDIUM',
        reason: 'moderate_accuracy_gps',
        isValid: true,
        accuracy
      };
    }

    // Poor reported accuracy - but could still be accurate
    // This is where we get smarter!
    if (accuracy >= 100) {
      return this.assessPoorAccuracyGPS(accuracy, additionalContext);
    }

    return {
      confidence: 'LOW',
      reason: 'low_accuracy_gps',
      isValid: true,
      accuracy
    };
  }

  static assessPoorAccuracyGPS(accuracy, context = {}) {
    const { 
      hasMovement = false, 
      signalStrength, 
      satelliteCount, 
      timestamp,
      previousLocations = [],
      isIndoors = false,
      weatherConditions = null
    } = context;

    let confidence = 'LOW';
    let reasons = ['poor_reported_accuracy'];
    let adjustedConfidence = 'LOW';

    // Factor 1: Movement detection
    // If user hasn't moved much, location is likely more accurate than reported
    if (!hasMovement && previousLocations.length > 0) {
      const locationStability = this.assessLocationStability(previousLocations);
      if (locationStability.isStable) {
        adjustedConfidence = 'MEDIUM';
        reasons.push('stable_location_pattern');
      }
    }

    // Factor 2: Satellite count (if available)
    if (satelliteCount && satelliteCount >= 4) {
      if (satelliteCount >= 8) {
        adjustedConfidence = adjustedConfidence === 'LOW' ? 'MEDIUM' : 'HIGH';
        reasons.push('good_satellite_coverage');
      } else {
        reasons.push('adequate_satellite_coverage');
      }
    }

    // Factor 3: Signal strength patterns
    if (signalStrength && signalStrength > -100) { // dBm
      adjustedConfidence = adjustedConfidence === 'LOW' ? 'MEDIUM' : adjustedConfidence;
      reasons.push('decent_signal_strength');
    }

    // Factor 4: Indoor/outdoor context
    if (!isIndoors) {
      adjustedConfidence = adjustedConfidence === 'LOW' ? 'MEDIUM' : adjustedConfidence;
      reasons.push('outdoor_location');
    }

    // Factor 5: Time-based accuracy improvement
    // GPS often starts poor and improves over time
    if (timestamp) {
      const timeSinceStart = Date.now() - new Date(timestamp).getTime();
      if (timeSinceStart > 30000) { // 30 seconds
        adjustedConfidence = adjustedConfidence === 'LOW' ? 'MEDIUM' : adjustedConfidence;
        reasons.push('gps_had_time_to_stabilize');
      }
    }

    // Conservative approach: Even with poor accuracy, don't completely reject
    return {
      confidence: adjustedConfidence,
      reason: 'poor_accuracy_with_context_analysis',
      isValid: true,
      accuracy,
      rawAccuracy: accuracy,
      contextualReasons: reasons,
      recommendation: this.getRecommendationForPoorGPS(accuracy, adjustedConfidence)
    };
  }

  static assessLocationStability(locations) {
    if (locations.length < 2) return { isStable: false };

    const distances = [];
    for (let i = 1; i < locations.length; i++) {
      const dist = this.calculateDistance(
        locations[i-1].lat, locations[i-1].lng,
        locations[i].lat, locations[i].lng
      );
      distances.push(dist);
    }

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const maxDistance = Math.max(...distances);

    return {
      isStable: avgDistance < 50 && maxDistance < 100, // Within 50m average, 100m max
      averageMovement: avgDistance,
      maxMovement: maxDistance,
      confidence: avgDistance < 20 ? 'HIGH' : avgDistance < 50 ? 'MEDIUM' : 'LOW'
    };
  }

  static getRecommendationForPoorGPS(accuracy, adjustedConfidence) {
    if (accuracy > 1000000) { // > 1000km - clearly wrong
      return 'GPS signal is extremely poor. Please use manual location selection.';
    }
    
    if (accuracy > 10000) { // > 10km
      return 'GPS accuracy is very poor. Consider moving to an open area or selecting location manually.';
    }
    
    if (accuracy > 1000) { // > 1km
      return 'GPS accuracy is poor but may still be usable. Verify location on map before submitting.';
    }
    
    if (adjustedConfidence === 'MEDIUM') {
      return 'GPS accuracy appears poor but other factors suggest location may be reliable.';
    }
    
    return 'GPS accuracy is moderate. Location should be reasonably accurate.';
  }

  static smartLocationValidation(locationData) {
    const {
      latitude,
      longitude,
      accuracy,
      reporterLatitude,
      reporterLongitude,
      isManualSelection = false,
      context = {}
    } = locationData;

    // Basic coordinate validation
    const coordinateValidation = this.validateCoordinates(latitude, longitude);
    if (!coordinateValidation.isValid) {
      return {
        isValid: false,
        confidence: 'LOW',
        validations: { coordinates: coordinateValidation },
        message: coordinateValidation.message
      };
    }

    // Enhanced GPS accuracy validation
    const accuracyValidation = this.validateGPSAccuracy(accuracy, context);

    // Location consistency check
    const consistencyValidation = this.validateLocationConsistency(
      { latitude, longitude },
      reporterLatitude && reporterLongitude ? { latitude: reporterLatitude, longitude: reporterLongitude } : null
    );

    // Smart confidence determination
    const overallConfidence = this.determineSmartConfidence(
      accuracyValidation,
      coordinateValidation,
      consistencyValidation,
      isManualSelection,
      context
    );

    return {
      isValid: coordinateValidation.isValid && consistencyValidation.isValid,
      confidence: overallConfidence.level,
      validations: {
        coordinates: coordinateValidation,
        accuracy: accuracyValidation,
        consistency: consistencyValidation
      },
      smartAnalysis: {
        rawAccuracy: accuracy,
        adjustedConfidence: accuracyValidation.confidence,
        contextualFactors: accuracyValidation.contextualReasons || [],
        recommendation: accuracyValidation.recommendation
      },
      summary: {
        hasAccuracy: !!accuracy,
        isManualSelection,
        distance: consistencyValidation.distance || null,
        trustLevel: overallConfidence.trustLevel
      }
    };
  }

  static determineSmartConfidence(accuracyValidation, coordinateValidation, consistencyValidation, isManualSelection, context) {
    // If coordinates are invalid, always LOW
    if (!coordinateValidation.isValid) {
      return { level: 'LOW', trustLevel: 'untrusted', reason: 'invalid_coordinates' };
    }

    // If locations are inconsistent, always LOW
    if (!consistencyValidation.isValid) {
      return { level: 'LOW', trustLevel: 'untrusted', reason: 'inconsistent_locations' };
    }

    // Manual selection gets MEDIUM at best
    if (isManualSelection) {
      return { level: 'MEDIUM', trustLevel: 'manual_verification', reason: 'user_selected' };
    }

    // Use enhanced accuracy assessment
    const accuracyLevel = accuracyValidation.confidence;
    
    // Additional context boosts
    let finalLevel = accuracyLevel;
    let trustLevel = 'gps_based';
    
    if (context.hasStablePattern && accuracyLevel === 'LOW') {
      finalLevel = 'MEDIUM';
      trustLevel = 'pattern_verified';
    }
    
    if (context.crossValidated && accuracyLevel === 'MEDIUM') {
      finalLevel = 'HIGH';
      trustLevel = 'cross_validated';
    }

    return { 
      level: finalLevel, 
      trustLevel,
      reason: 'smart_analysis',
      factors: accuracyValidation.contextualReasons || []
    };
  }

  // Inherit other methods from original service
  static validateCoordinates(latitude, longitude) {
    if (latitude < -90 || latitude > 90) {
      return { isValid: false, reason: 'invalid_latitude', message: 'Latitude must be between -90 and 90' };
    }
    if (longitude < -180 || longitude > 180) {
      return { isValid: false, reason: 'invalid_longitude', message: 'Longitude must be between -180 and 180' };
    }
    if (latitude === 0 && longitude === 0) {
      return { isValid: false, reason: 'null_island', message: 'Invalid coordinates (0,0)' };
    }
    return { isValid: true, reason: 'valid_coordinates' };
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  static validateLocationConsistency(issueLocation, reporterLocation, maxDistance = 5000) {
    if (!issueLocation || !reporterLocation) {
      return { isValid: true, reason: 'insufficient_data', confidence: 'MEDIUM' };
    }

    const distance = this.calculateDistance(
      issueLocation.latitude, issueLocation.longitude,
      reporterLocation.latitude, reporterLocation.longitude
    );

    if (distance > maxDistance) {
      return {
        isValid: false,
        reason: 'locations_too_far',
        distance: Math.round(distance),
        maxDistance,
        confidence: 'LOW',
        message: `Issue and reporter locations are ${Math.round(distance)}m apart (max: ${maxDistance}m)`
      };
    }

    return {
      isValid: true,
      reason: 'locations_consistent',
      distance: Math.round(distance),
      confidence: distance < 100 ? 'HIGH' : 'MEDIUM'
    };
  }
}

module.exports = EnhancedLocationValidationService;