# Query Logging Integration Guide

## SAFE INTEGRATION STEPS

### Step 1: Backup Current System
```bash
# Create backup of current database config
cp config/database.js config/database.backup.js
```

### Step 2: Update Database Imports (NO LOGIC CHANGES)

Replace existing database imports in your files:

#### BEFORE (Original):
```javascript
const pool = require('../config/database');
```

#### AFTER (With Logging):
```javascript
const pool = require('../config/loggedDatabase');
```

### Step 3: Files to Update

Update these imports in the following files:

1. **Controllers:**
   - `controllers/complaintController.js`
   - `controllers/authController.js`
   - `controllers/authorityController.js`
   - `controllers/adminController.js`
   - `controllers/jurisdictionController.js`

2. **Services:**
   - `services/aggregationService.js`
   - `services/complaintRoutingService.js`
   - `services/escalationService.js`
   - `services/auditService.js`
   - `services/slaService.js`
   - All other service files

3. **Middleware:**
   - `middleware/auth.js`
   - `middleware/auditLog.js`

### Step 4: Verify No Breaking Changes

The logged database wrapper maintains EXACT same interface:

```javascript
// All these work exactly the same:
const result = await pool.query('SELECT * FROM complaints WHERE id = $1', [123]);
const client = await pool.connect();
pool.on('error', handler);
pool.totalCount; // Still works
```

### Step 5: Environment Configuration

Add to your `.env` file:
```bash
# Enable query logging
ENABLE_QUERY_LOGGING=true

# Log only spatial queries (optional)
LOG_SPATIAL_ONLY=false

# Minimum duration to log (optional)
MIN_LOG_DURATION=50

# Enable periodic stats (optional)
ENABLE_PERIODIC_STATS=true
```

### Step 6: Test Integration

1. Start your server
2. Make a few API calls
3. Check console for query logs
4. Verify all functionality still works

## EXAMPLE REPLACEMENTS

### complaintController.js
```javascript
// BEFORE
const pool = require('../config/database');

// AFTER  
const pool = require('../config/loggedDatabase');

// Everything else stays EXACTLY the same
const submitComplaint = async (req, res) => {
  // ... existing code unchanged ...
  const result = await pool.query('SELECT ...', params); // Now logged!
  // ... rest unchanged ...
};
```

### aggregationService.js
```javascript
// BEFORE
const pool = require('../config/database');

// AFTER
const pool = require('../config/loggedDatabase');

// All existing functions work identically
const findMatchingIssue = async (categoryId, lat, lon, userId, client) => {
  // ... existing PostGIS queries now logged automatically ...
  const result = await client.query(`
    SELECT i.id FROM issues i 
    WHERE ST_DWithin(i.location::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 100)
  `, [lat, lon]); // This will be logged as spatial query!
  
  return result;
};
```

## ROLLBACK PLAN

If anything breaks (it shouldn't), instantly rollback:

```javascript
// Change back to original
const pool = require('../config/database');
```

## VERIFICATION CHECKLIST

✅ All API endpoints still work  
✅ Database queries execute normally  
✅ Query logs appear in console  
✅ Spatial queries are highlighted  
✅ No changes to response data  
✅ No changes to query logic  
✅ Performance impact minimal  

## TROUBLESHOOTING

### Issue: No logs appearing
**Solution:** Check `ENABLE_QUERY_LOGGING=true` in .env

### Issue: Too many logs
**Solution:** Set `LOG_SPATIAL_ONLY=true` or increase `MIN_LOG_DURATION`

### Issue: Colors not working
**Solution:** Check terminal supports colors, or set `NO_COLOR=false`

### Issue: EXPLAIN ANALYZE errors
**Solution:** Only runs in development mode, errors are ignored

The integration is designed to be 100% safe with zero breaking changes!