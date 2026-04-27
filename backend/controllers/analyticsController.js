const pool = require('../config/database');

class AnalyticsController {
  // Get heatmap data - clustered complaint coordinates with optional filters
  static async getHeatmapData(req, res) {
    try {
      const { categoryId, days = 7, status, zoom } = req.query;
      
      // Dynamic clustering based on zoom level
      const eps = zoom && zoom > 12 ? 0.0005 : 0.001;
      
      let baseQuery = `
        SELECT *
        FROM complaints 
        WHERE created_at > NOW() - ($1 * INTERVAL '1 day')
          AND status != 'rejected'
          AND location IS NOT NULL
      `;
      
      const params = [parseInt(days)];
      let paramIndex = 2;
      
      if (categoryId && categoryId !== 'all') {
        baseQuery += ` AND category_id = $${paramIndex}`;
        params.push(parseInt(categoryId));
        paramIndex++;
      }
      
      if (status && status !== 'all') {
        baseQuery = baseQuery.replace('FROM complaints', 'FROM complaints c JOIN issues i ON c.issue_id = i.id');
        baseQuery += ` AND i.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
      
      const clusterQuery = `
        SELECT
          AVG(ST_Y(location::geometry)) AS lat,
          AVG(ST_X(location::geometry)) AS lng,
          COUNT(*) AS count
        FROM (
          SELECT *,
            ST_ClusterDBSCAN(location::geometry, eps := ${eps}, minpoints := 2) OVER () AS cluster_id
          FROM (${baseQuery}) base
        ) clustered
        WHERE cluster_id IS NOT NULL
        GROUP BY cluster_id
        
        UNION ALL
        
        SELECT
          ST_Y(location::geometry) AS lat,
          ST_X(location::geometry) AS lng,
          1 AS count
        FROM (
          SELECT *,
            ST_ClusterDBSCAN(location::geometry, eps := ${eps}, minpoints := 2) OVER () AS cluster_id
          FROM (${baseQuery}) base
        ) unclustered
        WHERE cluster_id IS NULL
        LIMIT 1000
      `;
      
      const result = await pool.query(clusterQuery, params);
      
      res.json({
        success: true,
        clusters: result.rows.map(row => ({
          lat: parseFloat(row.lat),
          lng: parseFloat(row.lng),
          count: parseInt(row.count)
        }))
      });
    } catch (error) {
      console.error('Heatmap data error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch heatmap data'
      });
    }
  }

  // Get summary analytics
  static async getSummaryAnalytics(req, res) {
    try {
      // Get total complaints (last 30 days)
      const totalQuery = `
        SELECT COUNT(*) as total_complaints
        FROM complaints c
        WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND c.validation_status != 'DUPLICATE'
      `;

      // Get status breakdown
      const statusQuery = `
        SELECT 
          i.status,
          COUNT(*) as count
        FROM complaints c
        JOIN issues i ON c.issue_id = i.id
        WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND c.validation_status != 'DUPLICATE'
        GROUP BY i.status
      `;

      // Get average resolution time
      const resolutionQuery = `
        SELECT 
          AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at))/3600) as avg_hours
        FROM issues i
        WHERE i.status = 'resolved'
          AND i.resolved_at IS NOT NULL
          AND i.created_at >= CURRENT_DATE - INTERVAL '30 days'
      `;

      // Get daily trend (last 7 days)
      const trendQuery = `
        SELECT 
          DATE(c.created_at) as date,
          COUNT(*) as complaints
        FROM complaints c
        WHERE c.created_at >= CURRENT_DATE - INTERVAL '7 days'
          AND c.validation_status != 'DUPLICATE'
        GROUP BY DATE(c.created_at)
        ORDER BY date DESC
      `;

      // Get category breakdown
      const categoryQuery = `
        SELECT 
          cat.name as category,
          COUNT(*) as count
        FROM complaints c
        JOIN categories cat ON c.category_id = cat.id
        WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
          AND c.validation_status != 'DUPLICATE'
        GROUP BY cat.name
        ORDER BY count DESC
        LIMIT 5
      `;

      const [totalResult, statusResult, resolutionResult, trendResult, categoryResult] = await Promise.all([
        pool.query(totalQuery),
        pool.query(statusQuery),
        pool.query(resolutionQuery),
        pool.query(trendQuery),
        pool.query(categoryQuery)
      ]);

      // Process status data
      const statusData = statusResult.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {});

      const resolved = statusData.resolved || 0;
      const pending = (statusData.pending || 0) + (statusData.verified || 0) + (statusData.in_progress || 0);
      const rejected = statusData.rejected || 0;

      res.json({
        success: true,
        data: {
          totalComplaints: parseInt(totalResult.rows[0]?.total_complaints || 0),
          resolved: resolved,
          pending: pending,
          rejected: rejected,
          avgResolutionHours: parseFloat(resolutionResult.rows[0]?.avg_hours || 0),
          dailyTrend: trendResult.rows.map(row => ({
            date: row.date,
            complaints: parseInt(row.complaints)
          })),
          topCategories: categoryResult.rows.map(row => ({
            category: row.category,
            count: parseInt(row.count)
          }))
        }
      });
    } catch (error) {
      console.error('Summary analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch analytics summary'
      });
    }
  }

  // Get categories for filter dropdown
  static async getCategories(req, res) {
    try {
      const query = `
        SELECT id, name
        FROM categories
        ORDER BY name ASC
      `;

      const result = await pool.query(query);
      
      res.json({
        success: true,
        categories: result.rows
      });
    } catch (error) {
      console.error('Categories error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch categories'
      });
    }
  }
}

module.exports = AnalyticsController;