const fs = require('fs').promises;
const path = require('path');

class QueryPerformanceMonitor {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.logFile = options.logFile || path.join(__dirname, '../logs/query-performance.json');
    this.maxEntries = options.maxEntries || 1000;
    this.performanceData = [];
    this.thresholds = {
      slow: options.slowThreshold || 1000,
      moderate: options.moderateThreshold || 500,
      fast: options.fastThreshold || 100
    };
  }

  /**
   * Record query performance data
   */
  async recordQuery(queryData) {
    if (!this.enabled) return;

    const entry = {
      timestamp: new Date().toISOString(),
      query: this.sanitizeQuery(queryData.text),
      duration: queryData.duration,
      isSpatial: this.isSpatialQuery(queryData.text),
      spatialFunctions: this.extractSpatialFunctions(queryData.text),
      paramCount: queryData.params ? queryData.params.length : 0,
      hasIndex: queryData.explainResult ? this.hasIndexUsage(queryData.explainResult) : null,
      error: queryData.error ? queryData.error.message : null
    };

    this.performanceData.push(entry);

    // Keep only recent entries
    if (this.performanceData.length > this.maxEntries) {
      this.performanceData = this.performanceData.slice(-this.maxEntries);
    }

    // Periodically save to file
    if (this.performanceData.length % 50 === 0) {
      await this.saveToFile();
    }
  }

  /**
   * Analyze performance patterns
   */
  analyzePerformance(timeWindow = 3600000) { // Default 1 hour
    const cutoff = new Date(Date.now() - timeWindow);
    const recentQueries = this.performanceData.filter(
      entry => new Date(entry.timestamp) > cutoff
    );

    if (recentQueries.length === 0) {
      return { message: 'No queries in the specified time window' };
    }

    const spatialQueries = recentQueries.filter(q => q.isSpatial);
    const nonSpatialQueries = recentQueries.filter(q => !q.isSpatial);
    const slowQueries = recentQueries.filter(q => q.duration > this.thresholds.slow);
    const errorQueries = recentQueries.filter(q => q.error);

    const analysis = {
      timeWindow: `${timeWindow / 1000 / 60} minutes`,
      totalQueries: recentQueries.length,
      spatialQueries: spatialQueries.length,
      nonSpatialQueries: nonSpatialQueries.length,
      
      performance: {
        averageDuration: this.calculateAverage(recentQueries.map(q => q.duration)),
        medianDuration: this.calculateMedian(recentQueries.map(q => q.duration)),
        slowQueries: slowQueries.length,
        slowQueryPercentage: ((slowQueries.length / recentQueries.length) * 100).toFixed(2),
        fastQueries: recentQueries.filter(q => q.duration < this.thresholds.fast).length
      },

      spatialAnalysis: {
        averageSpatialDuration: spatialQueries.length > 0 
          ? this.calculateAverage(spatialQueries.map(q => q.duration))
          : 0,
        averageNonSpatialDuration: nonSpatialQueries.length > 0
          ? this.calculateAverage(nonSpatialQueries.map(q => q.duration))
          : 0,
        mostUsedSpatialFunctions: this.getMostUsedSpatialFunctions(spatialQueries),
        spatialQueriesWithIndex: spatialQueries.filter(q => q.hasIndex).length,
        spatialQueriesWithoutIndex: spatialQueries.filter(q => q.hasIndex === false).length
      },

      errors: {
        totalErrors: errorQueries.length,
        errorRate: ((errorQueries.length / recentQueries.length) * 100).toFixed(2),
        commonErrors: this.getCommonErrors(errorQueries)
      },

      recommendations: this.generateRecommendations(recentQueries, spatialQueries, slowQueries)
    };

    return analysis;
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations(allQueries, spatialQueries, slowQueries) {
    const recommendations = [];

    // Check for queries without indexes
    const spatialWithoutIndex = spatialQueries.filter(q => q.hasIndex === false);
    if (spatialWithoutIndex.length > 0) {
      recommendations.push({
        type: 'INDEX_MISSING',
        priority: 'HIGH',
        message: `${spatialWithoutIndex.length} spatial queries are not using indexes. Consider adding spatial indexes.`,
        queries: spatialWithoutIndex.slice(0, 3).map(q => q.query)
      });
    }

    // Check for consistently slow queries
    const consistentlySlowQueries = this.findConsistentlySlowQueries(allQueries);
    if (consistentlySlowQueries.length > 0) {
      recommendations.push({
        type: 'SLOW_QUERY',
        priority: 'HIGH',
        message: `${consistentlySlowQueries.length} query patterns are consistently slow.`,
        queries: consistentlySlowQueries
      });
    }

    // Check for high error rate
    const errorRate = (allQueries.filter(q => q.error).length / allQueries.length) * 100;
    if (errorRate > 5) {
      recommendations.push({
        type: 'HIGH_ERROR_RATE',
        priority: 'MEDIUM',
        message: `Error rate is ${errorRate.toFixed(2)}%. Review query patterns and error handling.`
      });
    }

    // Check for spatial query performance
    const avgSpatialDuration = spatialQueries.length > 0 
      ? this.calculateAverage(spatialQueries.map(q => q.duration))
      : 0;
    
    if (avgSpatialDuration > this.thresholds.moderate) {
      recommendations.push({
        type: 'SPATIAL_PERFORMANCE',
        priority: 'MEDIUM',
        message: `Average spatial query duration is ${avgSpatialDuration.toFixed(2)}ms. Consider optimizing spatial queries.`
      });
    }

    return recommendations;
  }

  /**
   * Helper methods
   */
  sanitizeQuery(query) {
    return query.replace(/\s+/g, ' ').trim().substring(0, 200);
  }

  isSpatialQuery(query) {
    return /ST_\w+|geography|geometry/i.test(query);
  }

  extractSpatialFunctions(query) {
    const functions = [];
    const spatialFunctionRegex = /ST_(\w+)/gi;
    let match;
    while ((match = spatialFunctionRegex.exec(query)) !== null) {
      if (!functions.includes(match[0])) {
        functions.push(match[0]);
      }
    }
    return functions;
  }

  hasIndexUsage(explainResult) {
    if (!explainResult || !explainResult.rows) return null;
    const plan = JSON.stringify(explainResult.rows);
    return /Index Scan|Bitmap Index Scan/i.test(plan);
  }

  calculateAverage(numbers) {
    return numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;
  }

  calculateMedian(numbers) {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  getMostUsedSpatialFunctions(spatialQueries) {
    const functionCounts = {};
    spatialQueries.forEach(query => {
      query.spatialFunctions.forEach(func => {
        functionCounts[func] = (functionCounts[func] || 0) + 1;
      });
    });
    
    return Object.entries(functionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([func, count]) => ({ function: func, count }));
  }

  getCommonErrors(errorQueries) {
    const errorCounts = {};
    errorQueries.forEach(query => {
      const errorType = query.error.split(':')[0];
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    });
    
    return Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([error, count]) => ({ error, count }));
  }

  findConsistentlySlowQueries(queries) {
    const queryPatterns = {};
    
    queries.forEach(query => {
      const pattern = this.getQueryPattern(query.query);
      if (!queryPatterns[pattern]) {
        queryPatterns[pattern] = [];
      }
      queryPatterns[pattern].push(query.duration);
    });

    return Object.entries(queryPatterns)
      .filter(([pattern, durations]) => {
        const avgDuration = this.calculateAverage(durations);
        return durations.length >= 3 && avgDuration > this.thresholds.slow;
      })
      .map(([pattern, durations]) => ({
        pattern,
        count: durations.length,
        averageDuration: this.calculateAverage(durations)
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 5);
  }

  getQueryPattern(query) {
    return query
      .replace(/\$\d+/g, '$?')
      .replace(/\d+/g, 'N')
      .replace(/'[^']*'/g, "'?'")
      .substring(0, 100);
  }

  async saveToFile() {
    try {
      const dir = path.dirname(this.logFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.logFile, JSON.stringify(this.performanceData, null, 2));
    } catch (error) {
      console.warn('Failed to save performance data:', error.message);
    }
  }

  async loadFromFile() {
    try {
      const data = await fs.readFile(this.logFile, 'utf8');
      this.performanceData = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      this.performanceData = [];
    }
  }

  /**
   * Generate performance report
   */
  generateReport(timeWindow = 3600000) {
    const analysis = this.analyzePerformance(timeWindow);
    
    console.log('\n📊 QUERY PERFORMANCE REPORT');
    console.log('='.repeat(50));
    console.log(`Time Window: ${analysis.timeWindow}`);
    console.log(`Total Queries: ${analysis.totalQueries}`);
    console.log(`Spatial Queries: ${analysis.spatialQueries} (${((analysis.spatialQueries / analysis.totalQueries) * 100).toFixed(1)}%)`);
    
    console.log('\n⏱️  Performance Metrics:');
    console.log(`Average Duration: ${analysis.performance.averageDuration.toFixed(2)}ms`);
    console.log(`Median Duration: ${analysis.performance.medianDuration.toFixed(2)}ms`);
    console.log(`Slow Queries: ${analysis.performance.slowQueries} (${analysis.performance.slowQueryPercentage}%)`);
    
    console.log('\n🌍 Spatial Query Analysis:');
    console.log(`Average Spatial Duration: ${analysis.spatialAnalysis.averageSpatialDuration.toFixed(2)}ms`);
    console.log(`Average Non-Spatial Duration: ${analysis.spatialAnalysis.averageNonSpatialDuration.toFixed(2)}ms`);
    console.log(`Spatial Queries with Index: ${analysis.spatialAnalysis.spatialQueriesWithIndex}`);
    console.log(`Spatial Queries without Index: ${analysis.spatialAnalysis.spatialQueriesWithoutIndex}`);
    
    if (analysis.spatialAnalysis.mostUsedSpatialFunctions.length > 0) {
      console.log('\nMost Used Spatial Functions:');
      analysis.spatialAnalysis.mostUsedSpatialFunctions.forEach(({ function: func, count }) => {
        console.log(`  ${func}: ${count} times`);
      });
    }
    
    console.log('\n🚨 Recommendations:');
    if (analysis.recommendations.length === 0) {
      console.log('  No recommendations - performance looks good!');
    } else {
      analysis.recommendations.forEach(rec => {
        console.log(`  [${rec.priority}] ${rec.message}`);
      });
    }
    
    console.log('='.repeat(50));
    
    return analysis;
  }
}

module.exports = QueryPerformanceMonitor;