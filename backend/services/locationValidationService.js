class LocationValidationService {
  static validateGPSAccuracy(accuracy) {
    if (!accuracy || accuracy === null || accuracy === undefined) {
      return {
        confidence: 'MEDIUM',
        reason: 'no_accuracy_data',
        isValid: true
      };
    }

    if (accuracy < 20) {
      return {
        confidence: 'HIGH',
        reason: 'high_accuracy_gps',
        isValid: true,
        accuracy
      };
    }

    if (accuracy < 100) {
      return {
        confidence: 'MEDIUM',
        reason: 'moderate_accuracy_gps',
        isValid: true,
        accuracy
      };
    }

    return {
      confidence: 'LOW',
      reason: 'low_accuracy_gps',
      isValid: true,
      accuracy
    };
  }

  static validateCoordinates(latitude, longitude) {
    // Basic coordinate validation
    if (latitude < -90 || latitude > 90) {
      return {
        isValid: false,
        reason: 'invalid_latitude',
        message: 'Latitude must be between -90 and 90'
      };
    }

    if (longitude < -180 || longitude > 180) {
      return {
        isValid: false,
        reason: 'invalid_longitude',
        message: 'Longitude must be between -180 and 180'
      };
    }

    // Check for obviously fake coordinates (0,0)
    if (latitude === 0 && longitude === 0) {
      return {
        isValid: false,
        reason: 'null_island',
        message: 'Invalid coordinates (0,0)'
      };
    }

    return {
      isValid: true,
      reason: 'valid_coordinates'
    };
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  static validateLocationConsistency(issueLocation, reporterLocation, maxDistance = 5000) {
    if (!issueLocation || !reporterLocation) {
      return {
        isValid: true,
        reason: 'insufficient_data',
        confidence: 'MEDIUM'
      };
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

  static determineOverallConfidence(gpsAccuracy, coordinateValidation, consistencyValidation, hasManualSelection = false) {
    // If coordinates are invalid, always LOW
    if (!coordinateValidation.isValid) {
      return 'LOW';
    }

    // If locations are inconsistent, always LOW
    if (!consistencyValidation.isValid) {
      return 'LOW';
    }

    // If manually selected, MEDIUM at best
    if (hasManualSelection) {
      return 'MEDIUM';
    }

    // Use GPS accuracy to determine confidence
    const accuracyValidation = this.validateGPSAccuracy(gpsAccuracy);
    return accuracyValidation.confidence;
  }

  static validateLocation(locationData) {
    const {
      latitude,
      longitude,
      accuracy,
      reporterLatitude,
      reporterLongitude,
      isManualSelection = false
    } = locationData;

    // Validate coordinates
    const coordinateValidation = this.validateCoordinates(latitude, longitude);
    if (!coordinateValidation.isValid) {
      return {
        isValid: false,
        confidence: 'LOW',
        validations: {
          coordinates: coordinateValidation,
          accuracy: null,
          consistency: null
        },
        message: coordinateValidation.message
      };
    }

    // Validate GPS accuracy
    const accuracyValidation = this.validateGPSAccuracy(accuracy);

    // Validate location consistency
    const consistencyValidation = this.validateLocationConsistency(
      { latitude, longitude },
      reporterLatitude && reporterLongitude ? { latitude: reporterLatitude, longitude: reporterLongitude } : null
    );

    // Determine overall confidence
    const overallConfidence = this.determineOverallConfidence(
      accuracy,
      coordinateValidation,
      consistencyValidation,
      isManualSelection
    );

    return {
      isValid: coordinateValidation.isValid && consistencyValidation.isValid,
      confidence: overallConfidence,
      validations: {
        coordinates: coordinateValidation,
        accuracy: accuracyValidation,
        consistency: consistencyValidation
      },
      summary: {
        hasAccuracy: !!accuracy,
        isManualSelection,
        distance: consistencyValidation.distance || null
      }
    };
  }
}

module.exports = LocationValidationService;