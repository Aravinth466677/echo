const ExifReader = require('exifr');

class MetadataValidationService {
  static async extractMetadata(imagePath) {
    try {
      const metadata = await ExifReader.parse(imagePath, {
        gps: true,
        exif: true,
        iptc: false,
        icc: false
      });

      return {
        timestamp: metadata?.DateTime || metadata?.DateTimeOriginal || null,
        gps: metadata?.latitude && metadata?.longitude ? {
          latitude: metadata.latitude,
          longitude: metadata.longitude,
          accuracy: metadata?.GPSHPositioningError || null
        } : null,
        camera: {
          make: metadata?.Make || null,
          model: metadata?.Model || null
        },
        software: metadata?.Software || null,
        raw: metadata
      };
    } catch (error) {
      console.error('Metadata extraction error:', error);
      return {
        timestamp: null,
        gps: null,
        camera: { make: null, model: null },
        software: null,
        error: error.message
      };
    }
  }

  static validateTimestamp(timestamp, maxDaysOld = 7) {
    if (!timestamp) return { valid: true, reason: 'no_timestamp' };

    const imageDate = new Date(timestamp);
    const now = new Date();
    const daysDiff = (now - imageDate) / (1000 * 60 * 60 * 24);

    if (daysDiff > maxDaysOld) {
      return {
        valid: false,
        reason: 'too_old',
        daysDiff: Math.floor(daysDiff),
        maxDaysOld
      };
    }

    if (imageDate > now) {
      return {
        valid: false,
        reason: 'future_date',
        daysDiff: Math.floor(daysDiff)
      };
    }

    return { valid: true, daysDiff: Math.floor(daysDiff) };
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

  static validateGPSLocation(imageGPS, userLat, userLon, maxDistanceMeters = 1000) {
    if (!imageGPS) return { valid: true, reason: 'no_gps_data' };

    const distance = this.calculateDistance(
      imageGPS.latitude, imageGPS.longitude,
      userLat, userLon
    );

    if (distance > maxDistanceMeters) {
      return {
        valid: false,
        reason: 'location_mismatch',
        distance: Math.round(distance),
        maxDistance: maxDistanceMeters,
        imageLocation: imageGPS,
        userLocation: { latitude: userLat, longitude: userLon }
      };
    }

    return {
      valid: true,
      distance: Math.round(distance),
      imageLocation: imageGPS,
      userLocation: { latitude: userLat, longitude: userLon }
    };
  }

  static determineLocationConfidence(gpsAccuracy, hasGPSData, locationValidation) {
    // HIGH: GPS with good accuracy and location match
    if (hasGPSData && gpsAccuracy && gpsAccuracy < 20 && locationValidation.valid) {
      return 'HIGH';
    }

    // LOW: No GPS data or significant location mismatch
    if (!hasGPSData || !locationValidation.valid) {
      return 'LOW';
    }

    // MEDIUM: Everything else
    return 'MEDIUM';
  }

  static async validateMetadata(imagePath, userLatitude, userLongitude) {
    try {
      const metadata = await this.extractMetadata(imagePath);
      
      const timestampValidation = this.validateTimestamp(metadata.timestamp);
      const locationValidation = this.validateGPSLocation(
        metadata.gps, userLatitude, userLongitude
      );

      const locationConfidence = this.determineLocationConfidence(
        metadata.gps?.accuracy,
        !!metadata.gps,
        locationValidation
      );

      let validationStatus = 'VALID';
      if (!timestampValidation.valid || !locationValidation.valid) {
        validationStatus = 'LOW_CONFIDENCE';
      }

      return {
        metadata,
        validations: {
          timestamp: timestampValidation,
          location: locationValidation
        },
        locationConfidence,
        validationStatus,
        summary: {
          hasGPS: !!metadata.gps,
          hasTimestamp: !!metadata.timestamp,
          timestampValid: timestampValidation.valid,
          locationValid: locationValidation.valid
        }
      };
    } catch (error) {
      console.error('Metadata validation error:', error);
      return {
        metadata: null,
        validations: {
          timestamp: { valid: true, reason: 'validation_error' },
          location: { valid: true, reason: 'validation_error' }
        },
        locationConfidence: 'LOW',
        validationStatus: 'LOW_CONFIDENCE',
        error: error.message
      };
    }
  }
}

module.exports = MetadataValidationService;