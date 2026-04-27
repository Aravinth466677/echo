const pool = require('./database');
const QueryLogger = require('../utils/queryLogger');

// Initialize logger with configuration
const queryLogger = new QueryLogger({
  enabled: process.env.ENABLE_QUERY_LOGGING !== 'false',
  debugMode: process.env.NODE_ENV === 'development',
  logSpatialOnly: process.env.LOG_SPATIAL_ONLY === 'true',
  colorOutput: process.env.NO_COLOR !== 'true',
  minDuration: parseInt(process.env.MIN_LOG_DURATION) || 0
});

// Query statistics tracking
const queryStats = {
  totalQueries: 0,
  spatialQueries: 0,
  totalDuration: 0,
  slowQueries: 0,
  indexedQueries: 0,
  errors: 0
};

class LoggedDatabase {
  constructor(originalPool) {
    this.pool = originalPool;
  }

  /**
   * Main query wrapper - preserves exact same interface as original pool.query
   */
  async query(text, params, callback) {
    const startTime = Date.now();
    let explainResult = null;
    let error = null;
    let result = null;

    // Handle different parameter patterns (same as original pg)
    const actualParams = Array.isArray(params) ? params : [];
    const actualCallback = typeof params === 'function' ? params : callback;

    try {
      // Execute EXPLAIN ANALYZE in debug mode for spatial queries
      if (queryLogger.debugMode && queryLogger.isSpatialQuery(text)) {
        try {
          const explainQuery = `EXPLAIN ANALYZE ${text}`;
          explainResult = await this.pool.query(explainQuery, actualParams);
        } catch (explainError) {
          // Ignore explain errors, continue with original query
          console.warn('EXPLAIN ANALYZE failed:', explainError.message);
        }
      }

      // Execute original query with exact same interface
      if (actualCallback) {
        // Callback style
        this.pool.query(text, actualParams, (err, res) => {
          const duration = Date.now() - startTime;
          this.logQueryExecution(text, actualParams, duration, explainResult, err);
          this.updateStats(text, duration, explainResult, err);
          actualCallback(err, res);
        });
        return; // Don't return anything for callback style
      } else {
        // Promise style
        result = await this.pool.query(text, actualParams);
      }
    } catch (err) {
      error = err;
      result = null;
    }

    const duration = Date.now() - startTime;
    
    // Log the query execution
    this.logQueryExecution(text, actualParams, duration, explainResult, error);
    
    // Update statistics
    this.updateStats(text, duration, explainResult, error);

    // Return or throw exactly as original would
    if (error) {
      throw error;
    }
    
    return result;
  }

  /**
   * Connect method wrapper
   */
  async connect() {
    const client = await this.pool.connect();
    
    // Wrap the client's query method too
    const originalQuery = client.query.bind(client);
    client.query = async (text, params, callback) => {
      return this.query.call({ pool: { query: originalQuery } }, text, params, callback);
    };
    
    return client;
  }

  /**
   * Log query execution details
   */
  logQueryExecution(text, params, duration, explainResult, error) {
    queryLogger.logQuery(text, params, duration, explainResult, error);
  }

  /**
   * Update query statistics
   */
  updateStats(text, duration, explainResult, error) {
    queryStats.totalQueries++;
    queryStats.totalDuration += duration;
    
    if (error) {
      queryStats.errors++;
    }
    
    if (queryLogger.isSpatialQuery(text)) {
      queryStats.spatialQueries++;
    }
    
    if (duration > 1000) {
      queryStats.slowQueries++;
    }
    
    if (explainResult && /Index Scan/i.test(JSON.stringify(explainResult.rows))) {
      queryStats.indexedQueries++;
    }
  }

  /**
   * Get query statistics
   */
  getStats() {
    return {
      ...queryStats,
      averageExecutionTime: queryStats.totalQueries > 0 ? queryStats.totalDuration / queryStats.totalQueries : 0
    };
  }

  getStatistics() {
    return this.getStats();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    Object.keys(queryStats).forEach(key => {
      queryStats[key] = 0;
    });
  }

  /**
   * Log statistics summary
   */
  logStatsSummary() {
    const stats = this.getStats();
    queryLogger.logSummary(stats);
  }

  // Proxy all other pool methods unchanged
  get totalCount() {
    return this.pool.totalCount;
  }

  get idleCount() {
    return this.pool.idleCount;
  }

  get waitingCount() {
    return this.pool.waitingCount;
  }

  async end() {
    return this.pool.end();
  }

  on(event, listener) {
    return this.pool.on(event, listener);
  }

  removeListener(event, listener) {
    return this.pool.removeListener(event, listener);
  }
}

// Create logged database instance
const loggedDb = new LoggedDatabase(pool);

// Export with same interface as original pool
module.exports = loggedDb;

// Also export utilities for manual use
module.exports.queryLogger = queryLogger;
module.exports.getQueryStats = () => loggedDb.getStats();
module.exports.resetQueryStats = () => loggedDb.resetStats();
module.exports.logStatsSummary = () => loggedDb.logStatsSummary();

// Periodic stats logging (optional)
if (process.env.ENABLE_PERIODIC_STATS === 'true') {
  setInterval(() => {
    const stats = loggedDb.getStats();
    if (stats.totalQueries > 0) {
      loggedDb.logStatsSummary();
      loggedDb.resetStats();
    }
  }, parseInt(process.env.STATS_INTERVAL) || 300000); // Default 5 minutes
}