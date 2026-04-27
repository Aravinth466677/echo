# Echo System - Priority and Escalation Logic

## Overview

The Echo system implements a sophisticated 3-level authority hierarchy with automatic escalation based on SLA (Service Level Agreement) timeouts and priority routing based on Echo Count (number of reports for the same issue).

## Priority vs Escalation - Key Distinction

**IMPORTANT**: Priority and Escalation are two separate mechanisms:

### Priority (Initial Routing)
- **Based on**: Echo Count (number of reports)
- **When**: At complaint submission time
- **Effect**: Determines initial authority assignment
- **High Priority**: Routes directly to SUPER_ADMIN (no further escalation possible)
- **PRACTICAL LIMITATION**: Rarely works because most complaints start with Echo Count = 1

### Escalation (SLA-Based)
- **Based on**: Time elapsed without action (SLA timeout)
- **When**: Continuously monitored after assignment
- **Effect**: Moves complaint up the hierarchy
- **Only applies**: To complaints not already at SUPER_ADMIN level
- **PRIMARY METHOD**: This is how most complaints actually reach higher authority levels

## Authority Hierarchy

```
JURISDICTION (Local Officers)
    ↓
DEPARTMENT (Department Heads)
    ↓
SUPER_ADMIN (Final Authority)
```

## Priority Routing Logic

### 1. Echo Count Based Priority

The system routes complaints based on the Echo Count, but in practice all complaints start with Echo Count = 1 and follow normal routing:

#### All Complaints (Echo Count starts at 1)
- **Route**: Standard hierarchy **JURISDICTION → DEPARTMENT → SUPER_ADMIN**
- **Reason**: `NORMAL`
- **Reality**: This is how 100% of complaints are actually routed initially

### 2. Priority-Based SLA Timeouts

Once routed, complaints get different escalation timeouts based on their current Echo Count:

#### High Priority (Echo Count ≥ 10)
- **Escalation Timeout**: 24 hours (longer time due to complexity)
- **Logic**: Critical issues get more time for proper resolution

#### Medium Priority (Echo Count ≥ 5) 
- **Escalation Timeout**: 24 hours
- **Logic**: Important issues get extended time

#### Normal Priority (Echo Count < 5)
- **Escalation Timeout**: 48 hours
- **Logic**: Standard issues follow regular timeline

### 2. Fallback Routing

When authorities are not available at expected levels:

- **No Jurisdiction Authority**: Route to `DEPARTMENT` (Reason: `NO_JURISDICTION_AUTHORITY`)
- **No Department Authority**: Route to `SUPER_ADMIN` (Reason: `NO_DEPARTMENT_AUTHORITY`)
- **No Jurisdiction Detected**: Route to `DEPARTMENT` (Reason: `NO_JURISDICTION`)

## SLA-Based Escalation

### SLA Timeouts by Category

| Category | SLA Hours | Escalation Trigger |
|----------|-----------|-------------------|
| Garbage | 72 hours | 3 days |
| Streetlight | 120 hours | 5 days |
| Pothole | 168 hours | 7 days |
| Water Supply | 96 hours | 4 days |
| Drainage | 120 hours | 5 days |
| Encroachment | 336 hours | 14 days |

### Escalation Timeouts by Priority

**NOTE**: These timeouts apply to all complaints as they move through the hierarchy based on their current Echo Count.

The system escalates complaints based on priority levels:

#### High Priority (Echo Count ≥ 10)
- **Escalation Time**: 24 hours at each level
- **Logic**: Critical issues get more time for thorough resolution
- **Path**: JURISDICTION → DEPARTMENT → SUPER_ADMIN

#### Medium Priority (Echo Count ≥ 5)
- **Escalation Time**: 24 hours at each level  
- **Logic**: Important issues get extended time
- **Path**: JURISDICTION → DEPARTMENT → SUPER_ADMIN

#### Normal Priority (Echo Count < 5)
- **Escalation Time**: 48 hours at each level
- **Logic**: Standard timeline for regular complaints
- **Path**: JURISDICTION → DEPARTMENT → SUPER_ADMIN

## Programmatic Implementation

### 1. Initial Routing (`routeComplaint`)

```javascript
// File: services/complaintRoutingService.js

async function routeComplaint(complaintId, categoryId, longitude, latitude, options = {}) {
    const { echoCount = 1 } = options;
    
    // Priority routing based on echo count
    if (echoCount >= 10) {
        // Route directly to SUPER_ADMIN
        authority = await findAuthority(categoryId, null, client, echoCount);
        routingReason = 'HIGH_PRIORITY_ESCALATION';
    } else if (echoCount >= 5) {
        // Route directly to DEPARTMENT
        authority = await findAuthority(categoryId, jurisdictionId, client, echoCount);
        routingReason = 'MEDIUM_PRIORITY_ESCALATION';
    } else {
        // Normal hierarchy: JURISDICTION → DEPARTMENT → SUPER_ADMIN
        authority = await findAuthority(categoryId, jurisdictionId, client, echoCount);
        routingReason = 'NORMAL';
    }
}
```

### 2. Authority Finding Logic (`findAuthority`)

```javascript
async function findAuthority(categoryId, jurisdictionId, dbClient = null, echoCount = 1) {
    // High priority: Direct to SUPER_ADMIN
    if (echoCount >= 10) {
        return await findSuperAdmin();
    }
    
    // Medium priority: Direct to DEPARTMENT
    if (echoCount >= 5) {
        return await findDepartmentAuthority(categoryId);
    }
    
    // Normal priority: Try hierarchy
    // 1. Try JURISDICTION authority
    if (jurisdictionId) {
        const jurisdictionAuth = await findJurisdictionAuthority(categoryId, jurisdictionId);
        if (jurisdictionAuth) return jurisdictionAuth;
    }
    
    // 2. Fallback to DEPARTMENT
    const departmentAuth = await findDepartmentAuthority(categoryId);
    if (departmentAuth) return departmentAuth;
    
    // 3. Final fallback to SUPER_ADMIN
    return await findSuperAdmin();
}
```

### 3. Escalation Service (`escalationService.js`)

```javascript
async function checkAndEscalateComplaints() {
    // Find complaints that need escalation based on priority and time
    const staleComplaints = await pool.query(`
        SELECT c.id, c.assigned_authority_id, c.category_id, c.escalation_level,
               EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.created_at))/3600 as hours_old,
               COALESCE(i.echo_count, 1) as echo_count
        FROM complaints c
        LEFT JOIN issues i ON c.issue_id = i.id
        WHERE c.status IN ('submitted', 'assigned', 'escalated')
        AND c.escalation_level < 2
        AND (
            -- High priority: escalate after 12 hours
            (COALESCE(i.echo_count, 1) >= 10 AND c.created_at < CURRENT_TIMESTAMP - INTERVAL '12 hours')
            OR
            -- Medium priority: escalate after 24 hours
            (COALESCE(i.echo_count, 1) >= 5 AND c.created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours')
            OR
            -- Normal priority: escalate after 48 hours
            (COALESCE(i.echo_count, 1) < 5 AND c.created_at < CURRENT_TIMESTAMP - INTERVAL '48 hours')
        )
    `);
    
    // Escalate each complaint
    for (const complaint of staleComplaints.rows) {
        await escalateComplaint(complaint.id, `Auto-escalation: ${Math.floor(complaint.hours_old)} hours without action`);
    }
}
```

### 4. Escalation Logic (`escalateComplaint`)

```javascript
async function escalateComplaint(complaintId, reason) {
    // Get current authority level
    const currentLevel = await getCurrentAuthorityLevel(complaintId);
    
    // Find next level authority
    const nextAuthorityId = await findNextLevelAuthority(currentAuthorityId, categoryId);
    
    // Escalation path: JURISDICTION → DEPARTMENT → SUPER_ADMIN
    if (currentLevel === 'JURISDICTION') {
        // Escalate to DEPARTMENT
        nextAuthority = await findDepartmentAuthority(categoryId);
    } else if (currentLevel === 'DEPARTMENT') {
        // Escalate to SUPER_ADMIN
        nextAuthority = await findSuperAdmin();
    }
    
    // Update complaint assignment
    await updateComplaintAssignment(complaintId, nextAuthorityId);
    
    // Log the escalation
    await logComplaintRouting({
        complaintId,
        routedToUserId: nextAuthorityId,
        routingReason: 'SLA_ESCALATION',
        escalationLevel: currentEscalationLevel + 1
    });
}
```

### 5. Priority Score Calculation

```javascript
// File: services/slaService.js

static calculatePriorityScore(issue, slaStatus) {
    let score = 0;
    
    // SLA breached gets highest priority
    if (slaStatus.is_breached) score += 1000;
    
    // Critical/urgent status
    if (slaStatus.status_color === 'red') score += 500;
    else if (slaStatus.status_color === 'orange') score += 250;
    
    // Echo count (more reports = higher priority)
    score += issue.echo_count * 10;
    
    // Time factor (closer to deadline = higher priority)
    if (slaStatus.remaining_seconds > 0) {
        score += Math.max(0, 100 - (slaStatus.remaining_seconds / 3600));
    }
    
    return score;
}
```

## Routing History Tracking

Every routing decision is logged in the `complaint_routing_logs` table:

```sql
CREATE TABLE complaint_routing_logs (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER REFERENCES complaints(id),
    issue_id INTEGER REFERENCES issues(id),
    routed_to_user_id INTEGER REFERENCES authorities(id),
    authority_level VARCHAR(20),
    authority_name VARCHAR(255),
    routing_reason VARCHAR(50),
    echo_count INTEGER,
    routed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    routing_details JSONB
);
```

### Routing Reasons

| Reason | Description |
|--------|-------------|
| `NORMAL` | Standard routing to jurisdiction authority |
| `HIGH_PRIORITY_ESCALATION` | Echo count ≥ 10, routed directly to SUPER_ADMIN |
| `MEDIUM_PRIORITY_ESCALATION` | Echo count ≥ 5, routed directly to DEPARTMENT |
| `NO_JURISDICTION` | No jurisdiction found, routed to department |
| `NO_JURISDICTION_AUTHORITY` | No jurisdiction authority available |
| `NO_DEPARTMENT_AUTHORITY` | No department authority available |
| `SLA_ESCALATION` | Escalated due to SLA timeout |

## Example Scenarios

### Scenario 1: Normal Priority Complaint
- **Echo Count**: 2
- **Initial Route**: JURISDICTION (Reason: `NORMAL`)
- **After 48h**: Escalate to DEPARTMENT (Reason: `SLA_ESCALATION`)
- **After 96h**: Escalate to SUPER_ADMIN (Reason: `SLA_ESCALATION`)
- **Total Routing Events**: 3

### Scenario 2: Medium Priority Complaint (Echo Count grows)
- **Echo Count**: 7 (after aggregation)
- **Initial Route**: JURISDICTION (Reason: `NORMAL`) - routed when Echo Count was 1
- **After 24h**: Escalate to DEPARTMENT (Reason: `SLA_ESCALATION`) - faster due to higher priority
- **After 48h**: Escalate to SUPER_ADMIN (Reason: `SLA_ESCALATION`)
- **Total Routing Events**: 3

### Scenario 3: High Priority Complaint (Echo Count grows)
- **Echo Count**: 12 (after aggregation)
- **Initial Route**: JURISDICTION (Reason: `NORMAL`) - routed when Echo Count was 1
- **After 24h**: Escalate to DEPARTMENT (Reason: `SLA_ESCALATION`) - faster due to critical priority
- **After 48h**: Escalate to SUPER_ADMIN (Reason: `SLA_ESCALATION`)
- **Total Routing Events**: 3

### Scenario 4: No Jurisdiction Authority
- **Echo Count**: 3
- **Jurisdiction**: No authority available
- **Initial Route**: DEPARTMENT (Reason: `NO_JURISDICTION_AUTHORITY`)
- **After 48h**: Escalate to SUPER_ADMIN (Reason: `SLA_ESCALATION`)
- **Total Routing Events**: 2

## Automated Escalation Schedule

The escalation service runs every hour and checks for:

1. **Overdue Complaints**: Based on priority-specific timeouts
2. **SLA Breaches**: Based on category-specific SLA deadlines
3. **Available Next Level**: Ensures escalation path exists

```javascript
// Runs every hour
setInterval(checkAndEscalateComplaints, 60 * 60 * 1000);
```

## UI Display Logic

### Authority Dashboard
- **Verification Queue**: Shows issues assigned to logged-in authority
- **Priority Sorting**: SLA breached → Report mode → Priority score
- **Assignment Display**: Shows current authority level and name

### Citizen Dashboard
- **Routing History**: Shows complete escalation chain
- **Current Assignment**: Shows who is currently handling the complaint
- **Routing Count**: Shows total number of routing events

## Configuration

### SLA Hours by Category
```sql
-- Categories table
UPDATE categories SET sla_hours = 72 WHERE name = 'Garbage';
UPDATE categories SET sla_hours = 120 WHERE name = 'Streetlight';
UPDATE categories SET sla_hours = 168 WHERE name = 'Pothole';
```

### Escalation Timeouts
```javascript
// In escalationService.js
const ESCALATION_TIMEOUTS = {
    HIGH_PRIORITY: 12, // hours
    MEDIUM_PRIORITY: 24, // hours
    NORMAL_PRIORITY: 48 // hours
};
```

This system ensures that critical issues (high Echo count) get immediate attention while maintaining proper escalation chains for all complaints based on their urgency and SLA requirements.

## Key Findings

### Real-World Priority System

The system works as follows in practice:

1. **All complaints start at JURISDICTION**: Every complaint begins with Echo Count = 1 and gets routed to ward-level authority
2. **Priority affects escalation speed**: Higher Echo Count (from aggregation) results in faster escalation timeouts
3. **Same hierarchy for all**: All complaints follow JURISDICTION → DEPARTMENT → SUPER_ADMIN path
4. **Dynamic priority**: As Echo Count increases through aggregation, escalation becomes faster

### Actual System Behavior

- **All complaints**: Start at JURISDICTION with 48-hour timeout
- **As Echo Count grows**: Timeout reduces to 24 hours for medium/high priority
- **Escalation method**: Time-based SLA escalation through the hierarchy
- **Priority benefit**: Faster movement through levels, not bypassing levels

### This Approach Makes Sense Because

1. **Local expertise first**: Ward authorities know local issues best
2. **Escalation based on urgency**: More reports = faster escalation
3. **No bypassing**: Ensures proper chain of command
4. **Dynamic response**: System adapts as issue severity becomes clear