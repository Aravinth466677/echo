# Dual-Mode Issue Reporting System

## Overview

The Echo system now supports both **on-location (in-place)** and **controlled remote reporting**, allowing citizens to report issues either from the exact location or from a nearby/distant location while maintaining data reliability through distance-based validation and trust scoring.

## System Architecture

### Components
- **Frontend**: React components with dual location capture
- **Backend**: Node.js/Express API with validation services
- **Database**: PostgreSQL with PostGIS for geospatial calculations
- **Validation**: Real-time distance calculation and trust scoring

## Reporting Modes

The system automatically determines the reporting mode based on the distance between user location and selected issue location:

### 1. In-Place Reporting (≤ 1km)
- **Mode**: `in_place`
- **Trust Level**: `high`
- **Behavior**: Direct submission allowed
- **UI**: Green indicator, no warnings

### 2. Near Remote Reporting (1-3km)
- **Mode**: `near_remote`
- **Trust Level**: `medium`
- **Behavior**: Warning shown before submission
- **UI**: Yellow indicator with warning message

### 3. Remote Reporting (3-5km)
- **Mode**: `remote`
- **Trust Level**: `low`
- **Behavior**: Mandatory justification required
- **UI**: Orange indicator with justification form

### 4. Blocked Reporting (> 5km)
- **Mode**: `blocked`
- **Trust Level**: `unverified`
- **Behavior**: Submission blocked
- **UI**: Red indicator with error message

## Location Capture

### Dual Location System
Every report captures two separate locations:

1. **Reporter Location**: User's current GPS location
2. **Issue Location**: Selected via map or auto-tagged via GPS

Both locations are stored in the database with full coordinates and geospatial data.

### GPS Handling
- **Available**: Automatic location detection
- **Denied**: Manual location input option
- **Unavailable**: Fallback to manual input

## Distance Calculation

### Backend Calculation (Preferred)
Uses PostGIS `ST_Distance` function for accurate geospatial calculations:

```sql
ST_Distance(
    ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
)
```

### Frontend Fallback
Uses Haversine formula for client-side validation:

```javascript
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth's radius in meters
  // ... Haversine calculation
  return Math.round(R * c);
};
```

## Trust Scoring System

### Trust Levels
- **High**: Reporter is at or very near the issue location
- **Medium**: Reporter is moderately far from the issue
- **Low**: Reporter is far from the issue location
- **Unverified**: Location could not be verified or too far

### Authority Dashboard Integration
Issues are displayed with:
- Trust level indicators
- Distance information
- Report mode classification
- Justification details (if provided)

### Sorting Priority
Issues are sorted by trust level:
1. High trust (in-place reports)
2. Medium trust
3. Low trust
4. Unverified

## Justification System

### Required Scenarios
Justification is mandatory when distance > 3km.

### Justification Options
1. **Saw while traveling**: Reporter witnessed issue while in transit
2. **Reporting for someone else**: Reporting on behalf of another person
3. **Other**: Custom reason with text input

### Storage
Justifications are stored with:
- `justification_type`: Selected option
- `remote_justification`: Full text description

## Validation Rules

### Client-Side Validation
- Real-time distance calculation
- Immediate feedback on trust level
- Dynamic UI updates based on distance

### Server-Side Validation
- Distance verification using PostGIS
- Trust level determination
- Reporting limits enforcement
- Justification requirement checks

### Reporting Limits
- **Daily limit**: 10 reports per user per day
- **Low trust limit**: 3 remote reports per user per day
- **Prevents abuse**: Stops spam and misuse

## Database Schema

### Enhanced Complaints Table
```sql
ALTER TABLE complaints 
ADD COLUMN reporter_location GEOGRAPHY(POINT, 4326),
ADD COLUMN reporter_latitude DECIMAL(10, 8),
ADD COLUMN reporter_longitude DECIMAL(11, 8),
ADD COLUMN distance_meters INTEGER,
ADD COLUMN trust_level VARCHAR(10),
ADD COLUMN remote_justification TEXT,
ADD COLUMN justification_type VARCHAR(50),
ADD COLUMN location_verification_status VARCHAR(20);
```

### User Reporting Limits Table
```sql
CREATE TABLE user_reporting_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    report_date DATE DEFAULT CURRENT_DATE,
    report_count INTEGER DEFAULT 0,
    low_trust_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### Validation Endpoint
```
POST /api/complaints/validate-remote
```
**Request Body:**
```json
{
  "reporterLatitude": 17.385,
  "reporterLongitude": 78.4867,
  "issueLatitude": 17.390,
  "issueLongitude": 78.4867
}
```

**Response:**
```json
{
  "validation": {
    "valid": true,
    "distance": 556,
    "trustLevel": "high",
    "requiresJustification": false,
    "rules": {
      "canSubmit": true,
      "showWarning": false,
      "warningMessage": ""
    }
  },
  "distanceFormatted": "556m",
  "trustIndicator": {
    "icon": "🟢",
    "label": "High Trust",
    "color": "#10b981"
  }
}
```

### Reporting Stats Endpoint
```
GET /api/complaints/reporting-stats
```
**Response:**
```json
{
  "stats": {
    "daily_reports": 3,
    "daily_low_trust": 1,
    "daily_limit": 10,
    "low_trust_limit": 3,
    "can_report": true,
    "can_report_low_trust": true
  }
}
```

### Justification Options Endpoint
```
GET /api/complaints/justification-options
```
**Response:**
```json
{
  "options": [
    { "value": "traveling", "label": "Saw while traveling" },
    { "value": "reporting_for_other", "label": "Reporting for someone else" },
    { "value": "other", "label": "Other (please specify)" }
  ]
}
```

## User Interface Components

### DualLocationPicker
- GPS detection for reporter location
- Interactive map for issue location selection
- Real-time distance calculation
- Trust level display

### TrustLevelIndicator
- Visual trust level representation
- Distance information
- Justification details
- Compact and full display modes

### RemoteReportingDemo
- Interactive testing interface
- Preset distance scenarios
- Real-time validation
- Educational tool for understanding the system

## Testing

### Test Script
Run the included test script to verify endpoints:

```bash
cd c:\project\Echo
node test-remote-reporting.js
```

### Test Scenarios
1. **Same Location (0m)**: High trust, direct submission
2. **Near Location (500m)**: High trust, direct submission
3. **Medium Distance (1.5km)**: Medium trust, warning shown
4. **Far Distance (4km)**: Low trust, justification required
5. **Too Far (7km)**: Blocked, submission prevented

## Security Features

### Abuse Prevention
- Daily reporting limits per user
- Low trust reporting limits
- Distance validation on both client and server
- Audit logging of all submissions

### Data Integrity
- Dual location storage for verification
- Trust level calculation and storage
- Justification requirement enforcement
- Location verification status tracking

## Benefits

### For Citizens
- **Flexibility**: Report issues from any reasonable distance
- **Transparency**: Clear understanding of trust levels
- **Guidance**: Real-time feedback on reporting validity

### For Authorities
- **Trust Indicators**: Easy identification of reliable reports
- **Prioritization**: Sort by trust level for efficient processing
- **Context**: Full distance and justification information
- **Fraud Prevention**: Reduced false or spam reports

### For System
- **Data Quality**: Higher reliability through trust scoring
- **Scalability**: Controlled remote reporting prevents abuse
- **Accountability**: Full audit trail of reporting decisions

## Configuration

### Distance Thresholds
Modify in `RemoteReportingService.js`:
```javascript
static determineTrustLevel(distanceMeters) {
  if (distanceMeters <= 1000) return 'high';    // 1km
  if (distanceMeters <= 3000) return 'medium';  // 3km
  if (distanceMeters <= 5000) return 'low';     // 5km
  return 'unverified';
}
```

### Reporting Limits
Modify in database functions:
```sql
-- Daily limits
daily_limit INTEGER := 10;
low_trust_limit INTEGER := 3;
```

## Future Enhancements

### Planned Features
1. **Photo Geolocation**: Extract GPS data from uploaded photos
2. **Machine Learning**: Improve trust scoring with ML models
3. **Batch Validation**: Validate multiple locations simultaneously
4. **Mobile Optimization**: Enhanced mobile GPS handling
5. **Offline Support**: Cache validation rules for offline use

### Integration Opportunities
1. **Google Maps**: Enhanced map interface
2. **Weather API**: Context-aware reporting
3. **Traffic API**: Travel-time based validation
4. **Social Verification**: Community-based trust scoring

## Troubleshooting

### Common Issues

**GPS Not Working**
- Enable location permissions in browser
- Use HTTPS in production (required for geolocation)
- Fallback to manual location input

**Distance Calculation Errors**
- Verify PostGIS extension is enabled
- Check coordinate system (SRID 4326)
- Validate input coordinates

**Validation Endpoint Errors**
- Ensure backend server is running
- Check database connection
- Verify user authentication

### Debug Mode
Enable detailed logging in `RemoteReportingService.js`:
```javascript
console.log('Distance calculation:', {
  reporter: { lat: reporterLat, lon: reporterLon },
  issue: { lat: issueLat, lon: issueLon },
  distance,
  trustLevel
});
```

## Conclusion

The dual-mode issue reporting system successfully balances flexibility with data reliability, allowing citizens to report issues from various distances while maintaining trust through transparent validation and scoring mechanisms. The system provides clear feedback to users and valuable context to authorities, improving the overall effectiveness of the civic complaint management process.