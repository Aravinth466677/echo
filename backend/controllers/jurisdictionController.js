const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

const createJurisdiction = async (req, res) => {
  const { name, geojson } = req.body;
  const userId = req.user.id;

  // Debug logging
  console.log('=== CREATE JURISDICTION REQUEST ===');
  console.log('User from token:', req.user);
  console.log('User ID:', userId);
  console.log('User role:', req.user.role);
  console.log('Request body:', { name, geojsonType: geojson?.type });

  // Validate input
  if (!name || !geojson) {
    return res.status(400).json({ error: 'Name and geojson are required' });
  }

  if (geojson.type !== 'Polygon') {
    return res.status(400).json({ error: 'GeoJSON must be a Polygon' });
  }

  if (!geojson.coordinates || !Array.isArray(geojson.coordinates)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  // Validate closed loop
  const ring = geojson.coordinates[0];
  if (ring.length < 4) {
    return res.status(400).json({ error: 'Polygon must have at least 4 points' });
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return res.status(400).json({ error: 'Polygon must be closed (first point = last point)' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO jurisdictions (name, boundary)
       VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))
       RETURNING id, name, ST_AsGeoJSON(boundary) as boundary, area_sq_meters`,
      [name, JSON.stringify(geojson)]
    );

    await auditLog(userId, 'JURISDICTION_CREATED', 'jurisdiction', result.rows[0].id, { name }, req.ip);

    res.status(201).json({
      message: 'Jurisdiction created successfully',
      jurisdiction: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        boundary: JSON.parse(result.rows[0].boundary),
        area_sq_meters: result.rows[0].area_sq_meters
      }
    });
  } catch (error) {
    console.error('Create jurisdiction error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Jurisdiction name already exists' });
    }
    res.status(500).json({ error: 'Failed to create jurisdiction' });
  }
};

const getJurisdictions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, ST_AsGeoJSON(boundary) as boundary, area_sq_meters, created_at
       FROM jurisdictions
       ORDER BY name`
    );

    const jurisdictions = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      boundary: JSON.parse(row.boundary),
      area_sq_meters: row.area_sq_meters,
      created_at: row.created_at
    }));

    res.json({ jurisdictions });
  } catch (error) {
    console.error('Get jurisdictions error:', error);
    res.status(500).json({ error: 'Failed to fetch jurisdictions' });
  }
};

const deleteJurisdiction = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'DELETE FROM jurisdictions WHERE id = $1 RETURNING name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Jurisdiction not found' });
    }

    await auditLog(userId, 'JURISDICTION_DELETED', 'jurisdiction', id, { name: result.rows[0].name }, req.ip);

    res.json({ message: 'Jurisdiction deleted successfully' });
  } catch (error) {
    console.error('Delete jurisdiction error:', error);
    res.status(500).json({ error: 'Failed to delete jurisdiction' });
  }
};

// Test if a point is within any jurisdiction
const testPoint = async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  try {
    // Try ST_Contains
    const containsResult = await pool.query(
      `SELECT id, name, area_sq_meters,
              0 as distance
       FROM jurisdictions
       WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       ORDER BY area_sq_meters ASC
       LIMIT 1`,
      [longitude, latitude]
    );

    if (containsResult.rows.length > 0) {
      return res.json({
        found: true,
        method: 'ST_Contains (exact match)',
        jurisdiction: containsResult.rows[0],
        coordinates: { latitude, longitude }
      });
    }

    // Try ST_Intersects
    const intersectsResult = await pool.query(
      `SELECT id, name, area_sq_meters,
              0 as distance
       FROM jurisdictions
       WHERE ST_Intersects(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       ORDER BY area_sq_meters ASC
       LIMIT 1`,
      [longitude, latitude]
    );

    if (intersectsResult.rows.length > 0) {
      return res.json({
        found: true,
        method: 'ST_Intersects (on boundary)',
        jurisdiction: intersectsResult.rows[0],
        coordinates: { latitude, longitude }
      });
    }

    // Try nearest within 5km
    const nearestResult = await pool.query(
      `SELECT id, name, area_sq_meters,
              ROUND(ST_Distance(boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)) as distance
       FROM jurisdictions
       WHERE ST_DWithin(boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 5000)
       ORDER BY distance ASC
       LIMIT 1`,
      [longitude, latitude]
    );

    if (nearestResult.rows.length > 0) {
      return res.json({
        found: true,
        method: 'ST_DWithin (within 5km)',
        jurisdiction: nearestResult.rows[0],
        distance: nearestResult.rows[0].distance,
        coordinates: { latitude, longitude }
      });
    }

    // Find absolute nearest
    const absoluteNearest = await pool.query(
      `SELECT id, name,
              ROUND(ST_Distance(boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)) as distance
       FROM jurisdictions
       ORDER BY distance ASC
       LIMIT 1`,
      [longitude, latitude]
    );

    res.json({
      found: false,
      nearest: absoluteNearest.rows[0] || null,
      coordinates: { latitude, longitude }
    });
  } catch (error) {
    console.error('Test point error:', error);
    res.status(500).json({ error: 'Failed to test coordinates' });
  }
};

// Helper function to assign jurisdiction to a point
const assignJurisdiction = async (longitude, latitude, dbClient = null) => {
  try {
    const client = dbClient || pool;
    console.log(`Assigning jurisdiction for: Lon ${longitude}, Lat ${latitude}`);
    
    // Try ST_Contains first (point inside polygon)
    const containsResult = await client.query(
      `SELECT id, name, area_sq_meters
       FROM jurisdictions
       WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       ORDER BY area_sq_meters ASC
       LIMIT 1`,
      [longitude, latitude]
    );

    if (containsResult.rows.length > 0) {
      console.log(`Jurisdiction found (ST_Contains): ${containsResult.rows[0].name}`);
      return containsResult.rows[0].id;
    }

    // Fallback to ST_Intersects (point on boundary)
    const intersectsResult = await client.query(
      `SELECT id, name, area_sq_meters
       FROM jurisdictions
       WHERE ST_Intersects(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       ORDER BY area_sq_meters ASC
       LIMIT 1`,
      [longitude, latitude]
    );

    if (intersectsResult.rows.length > 0) {
      console.log(`Jurisdiction found (ST_Intersects): ${intersectsResult.rows[0].name}`);
      return intersectsResult.rows[0].id;
    }

    // Fallback to nearest jurisdiction within 5km (GPS inaccuracy tolerance)
    const nearestResult = await client.query(
      `SELECT id, name,
              ST_Distance(boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
       FROM jurisdictions
       WHERE ST_DWithin(boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 5000)
       ORDER BY distance ASC
       LIMIT 1`,
      [longitude, latitude]
    );

    if (nearestResult.rows.length > 0) {
      console.log(`Jurisdiction found (Nearest within 5km): ${nearestResult.rows[0].name}, Distance: ${nearestResult.rows[0].distance}m`);
      return nearestResult.rows[0].id;
    }

    console.log('No jurisdiction found for this location');
    return null;
  } catch (error) {
    console.error('Assign jurisdiction error:', error);
    return null;
  }
};

module.exports = {
  createJurisdiction,
  getJurisdictions,
  deleteJurisdiction,
  assignJurisdiction,
  testPoint
};
