# Validation Layer Implementation

## Overview
A comprehensive validation layer has been implemented to prevent spam, duplicate complaints, fake images, and inaccurate locations before storing complaints in the database.

## Folder Structure

```
backend/
├── middleware/
│   ├── auth.js                    # Existing authentication
│   ├── auditLog.js               # Existing audit logging
│   └── rateLimiter.js            # NEW: Rate limiting middleware
├── services/
│   ├── aggregationService.js     # Existing complaint aggregation
│   ├── imageValidationService.js # NEW: Image hash & duplicate detection
│   ├── metadataValidationService.js # NEW: EXIF metadata validation
│   ├── duplicateDetectionService.js # NEW: PostGIS spatial duplicates
│   ├── locationValidationService.js # NEW: GPS accuracy validation
│   └── validationPipelineService.js # NEW: Main validation orchestrator
├── utils/
│   └── validationUtils.js        # NEW: Validation helper functions
├── routes/
│   ├── complaints.js             # UPDATED: Added rate limiting
│   └── validation.js             # NEW: Validation test endpoints
└── controllers/
    └── complaintController.js    # UPDATED: Integrated validation pipeline
```

## Database Changes

### New Tables
- `user_rate_limits`: Tracks submission counts per user
- `image_hashes`: Stores perceptual hashes for duplicate detection

### New Columns in `complaints`
- `image_hash`: Perceptual hash of uploaded image
- `validation_status`: VALID, DUPLICATE, SUSPECTED, LOW_CONFIDENCE
- `location_confidence`: HIGH, MEDIUM, LOW
- `duplicate_of`: References original complaint if duplicate
- `metadata_validation`: JSON with validation results

## Features Implemented

### 1. Rate Limiting ✅
- **Middleware**: `rateLimiter.js`
- **Limits**: 3 per hour, 10 per day per user
- **Storage**: Database-backed with automatic cleanup
- **Response**: Proper error messages with retry times

### 2. Duplicate Detection ✅
- **Service**: `duplicateDetectionService.js`
- **Method**: PostGIS ST_DWithin() for spatial queries
- **Parameters**: 100m radius, 24-hour window, same category
- **Logic**: Prevents same user from reporting twice, links others to existing issues

### 3. Image Validation ✅
- **Service**: `imageValidationService.js`
- **Method**: Perceptual hashing using `image-hash` library
- **Storage**: Hashes stored in `image_hashes` table
- **Detection**: Exact duplicates blocked, similar images flagged as SUSPECTED

### 4. Metadata Validation ✅
- **Service**: `metadataValidationService.js`
- **Library**: `exifr` for EXIF extraction
- **Checks**: 
  - Timestamp validation (max 7 days old)
  - GPS location vs user location (max 1km difference)
  - Camera information extraction

### 5. Location Validation ✅
- **Service**: `locationValidationService.js`
- **Confidence Levels**:
  - HIGH: GPS accuracy < 20m
  - MEDIUM: GPS accuracy < 100m or manual selection
  - LOW: Poor GPS or location inconsistencies

### 6. Validation Pipeline ✅
- **Service**: `validationPipelineService.js`
- **Flow**: Rate limit → Image → Metadata → Location → Duplicates → Status
- **Statuses**: VALID, DUPLICATE, SUSPECTED, LOW_CONFIDENCE
- **Integration**: Seamlessly integrated into existing complaint submission

## API Endpoints

### Existing (Updated)
- `POST /api/complaints/submit` - Now includes validation pipeline

### New
- `POST /api/validation/test-validation` - Test validation without submitting
- `GET /api/validation/validation-stats` - Admin statistics
- `GET /api/validation/rate-limit-status` - User's current rate limit status

## Response Format

```json
{
  "message": "Complaint submitted successfully",
  "complaintId": 123,
  "validation": {
    "status": "VALID",
    "confidence": "HIGH",
    "message": "Validation completed successfully",
    "imageHash": "abc123...",
    "locationConfidence": "HIGH"
  }
}
```

## Error Responses

### Rate Limit Exceeded
```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 3 complaints per hour allowed. Please try again later.",
  "retryAfter": 1800
}
```

### Duplicate Detected
```json
{
  "error": "Validation failed",
  "message": "You have already reported this issue",
  "validation": {
    "status": "DUPLICATE",
    "confidence": "HIGH",
    "duplicateOf": 456
  }
}
```

## Configuration

### Rate Limits (rateLimiter.js)
```javascript
const RATE_LIMITS = {
  HOURLY_LIMIT: 3,
  DAILY_LIMIT: 10
};
```

### Validation Thresholds
- **Image similarity**: Hamming distance ≤ 5
- **Location accuracy**: HIGH < 20m, MEDIUM < 100m
- **Timestamp age**: Max 7 days
- **GPS mismatch**: Max 1000m between image GPS and user location
- **Duplicate radius**: 100m for spatial detection

## Dependencies Added

```json
{
  "express-rate-limit": "Rate limiting",
  "sharp": "Image processing",
  "image-hash": "Perceptual hashing",
  "exifr": "EXIF metadata extraction"
}
```

## Usage Examples

### Test Validation
```bash
curl -X POST http://localhost:5000/api/validation/test-validation \
  -H "Authorization: Bearer <token>" \
  -F "evidence=@image.jpg" \
  -F "categoryId=1" \
  -F "latitude=40.7128" \
  -F "longitude=-74.0060"
```

### Check Rate Limit Status
```bash
curl -X GET http://localhost:5000/api/validation/rate-limit-status \
  -H "Authorization: Bearer <token>"
```

## Monitoring & Analytics

### Admin Dashboard Queries
- Validation status distribution
- Duplicate detection effectiveness
- Rate limiting statistics
- Image hash collision rates

### Performance Considerations
- Image hashing is CPU-intensive but runs async
- PostGIS spatial queries are optimized with indexes
- Rate limit cleanup runs automatically
- Validation results cached in complaint metadata

## Security Features

1. **Spam Prevention**: Rate limiting per authenticated user
2. **Duplicate Prevention**: Spatial and image-based detection
3. **Fake Image Detection**: Perceptual hashing and metadata validation
4. **Location Verification**: GPS accuracy and consistency checks
5. **Audit Trail**: All validation results stored for analysis

## Future Enhancements

1. **ML-based Image Classification**: Detect inappropriate content
2. **Advanced Location Verification**: Reverse geocoding validation
3. **Behavioral Analysis**: Pattern detection for suspicious users
4. **Real-time Monitoring**: Dashboard for validation metrics
5. **API Rate Limiting**: Global rate limits beyond user-specific ones

This implementation provides a robust, production-ready validation layer that maintains data quality while preserving user experience.