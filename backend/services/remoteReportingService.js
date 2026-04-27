class RemoteReportingService {
  static JUSTIFICATION_OPTIONS = [
    { value: 'traveling', label: 'Saw while traveling' },
    { value: 'reporting_for_other', label: 'Reporting for someone else' },
    { value: 'other', label: 'Other (please specify)' },
  ];

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(earthRadius * c);
  }

  static formatDistance(distanceMeters) {
    if (distanceMeters < 1000) {
      return `${distanceMeters}m`;
    }

    return `${(distanceMeters / 1000).toFixed(1)}km`;
  }

  static getTrustLevel(distanceMeters) {
    if (distanceMeters <= 1000) {
      return 'high';
    }

    if (distanceMeters <= 3000) {
      return 'medium';
    }

    if (distanceMeters <= 5000) {
      return 'low';
    }

    return 'blocked';
  }

  static buildValidation({ reportMode, issueLatitude, issueLongitude, reporterLatitude, reporterLongitude }) {
    const mode = reportMode === 'remote' ? 'remote' : 'in_place';

    const issueLat = Number.parseFloat(issueLatitude);
    const issueLon = Number.parseFloat(issueLongitude);
    const reporterLat =
      mode === 'remote'
        ? Number.parseFloat(reporterLatitude)
        : Number.parseFloat(reporterLatitude ?? issueLatitude);
    const reporterLon =
      mode === 'remote'
        ? Number.parseFloat(reporterLongitude)
        : Number.parseFloat(reporterLongitude ?? issueLongitude);

    if ([issueLat, issueLon, reporterLat, reporterLon].some((value) => Number.isNaN(value))) {
      return {
        valid: false,
        message: 'Reporter and issue locations are required.',
      };
    }

    if (mode === 'in_place') {
      return {
        valid: true,
        reportMode: 'in_place',
        reporterLocation: { lat: issueLat, lng: issueLon },
        issueLocation: { lat: issueLat, lng: issueLon },
        distance: 0,
        trustLevel: 'high',
        requiresJustification: false,
        warningMessage: '',
      };
    }

    const distance = this.calculateDistance(reporterLat, reporterLon, issueLat, issueLon);
    const trustLevel = this.getTrustLevel(distance);

    if (trustLevel === 'blocked') {
      return {
        valid: false,
        reportMode: 'remote',
        reporterLocation: { lat: reporterLat, lng: reporterLon },
        issueLocation: { lat: issueLat, lng: issueLon },
        distance,
        trustLevel,
        requiresJustification: true,
        message: 'Remote reporting is only allowed within 5km of the issue location.',
      };
    }

    let warningMessage = '';
    if (trustLevel === 'medium') {
      warningMessage =
        'You are 1-3km away from the issue. This report will be marked medium trust.';
    }

    if (trustLevel === 'low') {
      warningMessage =
        'You are 3-5km away from the issue. This report will be marked low trust.';
    }

    return {
      valid: true,
      reportMode: 'remote',
      reporterLocation: { lat: reporterLat, lng: reporterLon },
      issueLocation: { lat: issueLat, lng: issueLon },
      distance,
      trustLevel,
      requiresJustification: true,
      warningMessage,
    };
  }

  static validateForSubmit(payload) {
    const validation = this.buildValidation(payload);
    const description = String(payload.description || '').trim();
    const justification = String(payload.justification || '').trim();

    if (!validation.valid) {
      return validation;
    }

    if (!description) {
      return {
        ...validation,
        valid: false,
        message: 'Description is required for every report.',
      };
    }

    if (validation.reportMode === 'remote' && !justification) {
      return {
        ...validation,
        valid: false,
        message: 'A justification is required for every remote report.',
      };
    }

    return validation;
  }

  static getJustificationOptions() {
    return this.JUSTIFICATION_OPTIONS;
  }
}

module.exports = RemoteReportingService;
