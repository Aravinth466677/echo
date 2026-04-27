# Complaint Audit & Timeline System - Integration Guide

## Overview
Complete audit and transparency system that tracks every action on complaints with a visual timeline interface.

## ✅ **What's Implemented**

### **1. Database Layer**
- `complaint_history` table with UUID primary keys
- Automatic complaint creation logging via triggers
- Human-readable action descriptions via SQL functions
- Support for comments, resolution tracking, and metadata

### **2. Backend Services**
- `AuditService`: Core audit logging functionality
- `ComplaintService`: Enhanced complaint operations with audit integration
- Comprehensive API routes for timeline access

### **3. Frontend Components**
- `ComplaintTimeline.jsx`: Visual timeline component
- Responsive design with loading/error states
- Public and private timeline views

### **4. Security & Access Control**
- Role-based access (CITIZEN/AUTHORITY/ADMIN)
- Jurisdiction-based permissions
- Public timeline with sanitized data

## 🚀 **Quick Integration**

### **Step 1: Run Database Migrations**
```bash
cd c:\project\Echo\database
psql -U postgres -d echo_db -f complaint_audit_system_migration.sql
psql -U postgres -d echo_db -f complaint_comments_migration.sql
```

### **Step 2: Update Existing Controllers**
Replace direct database updates with audit-enabled service calls:

```javascript
// OLD WAY (Direct DB update)
await pool.query('UPDATE complaints SET status = $1 WHERE id = $2', [newStatus, complaintId]);

// NEW WAY (With audit logging)
const ComplaintService = require('../services/complaintService');

await ComplaintService.updateComplaintStatus({
  complaintId,
  newStatus,
  userId: req.user.id,
  userRole: req.user.role.toUpperCase(),
  remarks: 'Status updated via authority dashboard',
  req // For IP/user agent tracking
});
```

### **Step 3: Add Timeline to Frontend**
```jsx
import ComplaintTimeline from '../components/ComplaintTimeline';

// In complaint details page
<ComplaintTimeline 
  complaintId={complaint.id} 
  isPublic={false}
  className="mt-6"
/>
```

## 📋 **Available API Endpoints**

### **Timeline & History**
- `GET /api/complaints/:id/history` - Full timeline (authenticated)
- `GET /api/public/complaints/:id/timeline` - Public timeline (sanitized)

### **Status Management**
- `PUT /api/complaints/:id/status` - Update status with audit
- `POST /api/complaints/:id/resolve` - Resolve complaint
- `POST /api/complaints/:id/verify` - Citizen verification

### **Comments & Communication**
- `POST /api/complaints/:id/comments` - Add comment with audit

## 🔧 **Service Usage Examples**

### **1. Update Complaint Status**
```javascript
const ComplaintService = require('../services/complaintService');

// Authority updates status
const result = await ComplaintService.updateComplaintStatus({
  complaintId: 123,
  newStatus: 'in_progress',
  userId: req.user.id,
  userRole: 'AUTHORITY',
  remarks: 'Started working on the issue',
  metadata: {
    priority: 'high',
    estimatedCompletion: '2024-01-20'
  },
  req
});
```

### **2. Resolve Complaint**
```javascript
// Authority resolves complaint
const result = await ComplaintService.resolveComplaint({
  complaintId: 123,
  resolvedByUserId: req.user.id,
  resolvedByRole: 'AUTHORITY',
  resolutionNotes: 'Issue has been fixed',
  evidenceUrl: '/uploads/resolution-proof.jpg',
  req
});
```

### **3. Citizen Verification**
```javascript
// Citizen verifies resolution
const result = await ComplaintService.verifyResolution({
  complaintId: 123,
  citizenId: req.user.id,
  isVerified: true,
  feedback: 'Thank you for the quick fix!',
  rating: 5,
  req
});
```

### **4. Add Comments**
```javascript
// Add comment with audit trail
const result = await ComplaintService.addComment({
  complaintId: 123,
  userId: req.user.id,
  userRole: 'AUTHORITY',
  comment: 'Additional investigation required',
  isInternal: true, // Only visible to authorities/admins
  req
});
```

### **5. Manual Audit Logging**
```javascript
const AuditService = require('../services/auditService');

// Log custom actions
await AuditService.logComplaintAction({
  complaintId: 123,
  oldStatus: null,
  newStatus: null,
  userId: req.user.id,
  role: 'AUTHORITY',
  action: 'EVIDENCE_ADDED',
  remarks: 'Additional evidence uploaded',
  metadata: {
    evidenceType: 'photo',
    fileSize: '2.5MB',
    uploadedAt: new Date().toISOString()
  },
  ipAddress: req.ip,
  userAgent: req.get('User-Agent')
});
```

## 🎨 **Frontend Integration**

### **Basic Timeline**
```jsx
import ComplaintTimeline from '../components/ComplaintTimeline';

function ComplaintDetails({ complaint }) {
  return (
    <div>
      <h1>Complaint #{complaint.id}</h1>
      
      {/* Complaint details */}
      <div className="complaint-info">
        {/* ... complaint details ... */}
      </div>
      
      {/* Timeline */}
      <ComplaintTimeline 
        complaintId={complaint.id}
        className="mt-8"
      />
    </div>
  );
}
```

### **Public Timeline (No Auth Required)**
```jsx
<ComplaintTimeline 
  complaintId={complaint.id}
  isPublic={true}
  className="public-timeline"
/>
```

### **Custom Timeline Styling**
```css
.complaint-timeline.custom-style {
  border: 2px solid #e5e7eb;
  border-radius: 16px;
}

.complaint-timeline.custom-style .timeline-marker.color-blue {
  background: #your-brand-color;
}
```

## 🔒 **Security Features**

### **Access Control**
- **Citizens**: Can only view their own complaint timelines
- **Authorities**: Can view complaints in their jurisdiction
- **Admins**: Can view all complaint timelines
- **Public**: Can view sanitized timelines (no personal data)

### **Data Protection**
- Personal information (emails, IPs) only visible to admins
- Internal comments only visible to authorities/admins
- Metadata sanitized in public views
- IP addresses and user agents tracked for security

### **Audit Trail Integrity**
- UUID primary keys prevent enumeration
- Immutable audit records (no updates/deletes)
- Comprehensive metadata tracking
- Automatic timestamp generation

## 📊 **Human-Readable Messages**

The system automatically converts raw audit data into user-friendly messages:

| Raw Data | Human-Readable Message |
|----------|----------------------|
| `CREATED` | "Complaint submitted by citizen" |
| `submitted → assigned` | "Complaint assigned to authority" |
| `assigned → in_progress` | "Authority started working on complaint" |
| `in_progress → resolved` | "Authority marked complaint as resolved" |
| `resolved → verified` | "Citizen verified the resolution" |
| `resolved → rejected` | "Citizen rejected the resolution" |
| `ESCALATED` | "Complaint escalated due to SLA breach" |

## 🚨 **Error Handling**

### **Common Errors & Solutions**

1. **Access Denied**
   ```javascript
   // Error: User trying to access unauthorized complaint
   // Solution: Check user permissions before API call
   ```

2. **Invalid Status Transition**
   ```javascript
   // Error: Trying to go from 'resolved' to 'assigned'
   // Solution: Follow valid status transition rules
   ```

3. **Missing Required Fields**
   ```javascript
   // Error: Status update without required parameters
   // Solution: Validate input before service calls
   ```

## 🔄 **Migration from Existing System**

### **Step 1: Backup Existing Data**
```sql
-- Backup current complaints
CREATE TABLE complaints_backup AS SELECT * FROM complaints;
```

### **Step 2: Run Migrations**
```bash
# Apply all audit system migrations
psql -U postgres -d echo_db -f complaint_audit_system_migration.sql
psql -U postgres -d echo_db -f complaint_comments_migration.sql
```

### **Step 3: Migrate Existing Complaints**
```sql
-- Create initial audit entries for existing complaints
INSERT INTO complaint_history (
  complaint_id, old_status, new_status, changed_by, role, action, remarks
)
SELECT 
  id, NULL, status, user_id, 'CITIZEN', 'CREATED', 'Migrated from existing system'
FROM complaints 
WHERE NOT EXISTS (
  SELECT 1 FROM complaint_history WHERE complaint_id = complaints.id
);
```

### **Step 4: Update Controllers Gradually**
Replace direct database calls with service calls one endpoint at a time.

## 📈 **Performance Considerations**

- **Indexes**: All critical columns are indexed for fast queries
- **Pagination**: Timeline API supports limit parameters
- **Caching**: Consider Redis for frequently accessed timelines
- **Cleanup**: Old audit records can be archived (not deleted)

## 🧪 **Testing**

### **Test Timeline API**
```bash
# Get complaint timeline
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/complaints/123/history

# Get public timeline
curl http://localhost:5000/api/public/complaints/123/timeline

# Update status
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress","remarks":"Started work"}' \
  http://localhost:5000/api/complaints/123/status
```

The audit system is now fully integrated and ready for production use! Every complaint action will be automatically tracked with complete transparency and accountability.