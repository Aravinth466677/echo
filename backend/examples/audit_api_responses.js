// Example API Responses for Complaint Audit & Timeline System

// ===== GET /api/complaints/123/history =====
// Complete timeline with all audit entries

{
  "success": true,
  "complaint": {
    "id": 123,
    "status": "resolved",
    "categoryName": "Pothole",
    "citizenName": "John Doe",
    "authorityName": "Jane Smith",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "timeline": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "action": "CREATED",
      "oldStatus": null,
      "newStatus": "submitted",
      "role": "CITIZEN",
      "changedBy": "John Doe",
      "changedByEmail": "john@example.com",
      "description": "Complaint submitted by citizen",
      "remarks": "Complaint submitted",
      "timestamp": "2024-01-15T10:30:00Z",
      "metadata": {
        "category_id": 1,
        "location": {
          "latitude": 40.7128,
          "longitude": -74.0060
        }
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "action": "ASSIGNED",
      "oldStatus": null,
      "newStatus": null,
      "role": "SYSTEM",
      "changedBy": "System",
      "description": "Complaint assigned to authority",
      "remarks": "Complaint assigned to JURISDICTION authority",
      "timestamp": "2024-01-15T10:31:00Z",
      "metadata": {
        "assignment": {
          "assignedTo": 456,
          "assignedBy": null,
          "authorityLevel": "JURISDICTION",
          "timestamp": "2024-01-15T10:31:00Z"
        }
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "action": "STATUS_CHANGE",
      "oldStatus": "submitted",
      "newStatus": "assigned",
      "role": "SYSTEM",
      "changedBy": "System",
      "description": "Complaint assigned to authority",
      "remarks": "Status changed from submitted to assigned",
      "timestamp": "2024-01-15T10:31:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440004",
      "action": "STATUS_CHANGE",
      "oldStatus": "assigned",
      "newStatus": "in_progress",
      "role": "AUTHORITY",
      "changedBy": "Jane Smith",
      "changedByEmail": "jane@authority.gov",
      "description": "Authority started working on complaint",
      "remarks": "Started investigation of the reported pothole",
      "timestamp": "2024-01-15T14:20:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440005",
      "action": "COMMENT_ADDED",
      "oldStatus": null,
      "newStatus": null,
      "role": "AUTHORITY",
      "changedBy": "Jane Smith",
      "description": "Comment added by authority",
      "remarks": "Internal comment added",
      "timestamp": "2024-01-16T09:15:00Z",
      "metadata": {
        "comment": {
          "commentId": 789,
          "isInternal": true,
          "length": 85,
          "addedAt": "2024-01-16T09:15:00Z"
        }
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440006",
      "action": "RESOLVED",
      "oldStatus": "in_progress",
      "newStatus": "resolved",
      "role": "AUTHORITY",
      "changedBy": "Jane Smith",
      "description": "Complaint resolved by authority",
      "remarks": "Pothole has been filled and road surface restored",
      "timestamp": "2024-01-17T16:45:00Z",
      "metadata": {
        "resolution": {
          "resolvedBy": 456,
          "resolvedAt": "2024-01-17T16:45:00Z",
          "evidenceUrl": "/uploads/resolution-evidence-123.jpg",
          "notes": "Pothole has been filled and road surface restored"
        }
      }
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440007",
      "action": "VERIFIED",
      "oldStatus": "resolved",
      "newStatus": "verified",
      "role": "CITIZEN",
      "changedBy": "John Doe",
      "description": "Resolution verified by citizen",
      "remarks": "Thank you for the quick resolution!",
      "timestamp": "2024-01-18T08:30:00Z",
      "metadata": {
        "verification": {
          "isVerified": true,
          "feedback": "Thank you for the quick resolution!",
          "rating": 5,
          "verifiedAt": "2024-01-18T08:30:00Z"
        }
      }
    }
  ],
  "statistics": {
    "totalActions": 7,
    "uniqueActors": 3,
    "statusChanges": 4,
    "citizenActions": 2,
    "authorityActions": 3,
    "adminActions": 0,
    "firstAction": "2024-01-15T10:30:00Z",
    "lastAction": "2024-01-18T08:30:00Z"
  }
}