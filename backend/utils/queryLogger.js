let chalk;
try {
  chalk = require('chalk');
} catch (e) {
  // Fallback if chalk fails
  chalk = {
    blue: { bold: (text) => text },
    green: { bold: (text) => text },
    red: { bold: (text) => text },
    yellow: { bold: (text) => text },
    cyan: (text) => text,
    white: (text) => text,
    gray: (text) => text,
    magenta: { bold: (text) => text }
  };
}

class QueryLogger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.debugMode = options.debugMode || process.env.NODE_ENV === 'development';
    this.logSpatialOnly = options.logSpatialOnly || false;
    this.colorOutput = options.colorOutput !== false;
    this.minDuration = options.minDuration || 0; // Log queries taking longer than X ms
  }

  /**
   * Main logging function
   */
  logQuery(queryText, params = [], duration, explainResult = null, error = null) {
    if (!this.enabled) return;

    const isSpatialQuery = this.isSpatialQuery(queryText);
    
    // Skip non-spatial queries if logSpatialOnly is true
    if (this.logSpatialOnly && !isSpatialQuery) return;
    
    // Skip fast queries if minDuration is set
    if (duration < this.minDuration) return;

    const timestamp = new Date().toISOString();
    const formattedQuery = this.formatQuery(queryText, params);
    
    console.log('\n' + '='.repeat(80));
    
    // Header with timestamp and duration
    const header = `[${timestamp}] Query executed in ${duration}ms`;
    console.log(this.colorOutput ? chalk.blue.bold(header) : header);
    
    // Spatial query indicator
    if (isSpatialQuery) {
      const spatialIndicator = '[🌍 SPATIAL QUERY DETECTED]';
      console.log(this.colorOutput ? chalk.green.bold(spatialIndicator) : spatialIndicator);
      
      // Detect specific spatial functions
      const spatialFunctions = this.detectSpatialFunctions(queryText);
      if (spatialFunctions.length > 0) {
        const functionsText = `Spatial functions: ${spatialFunctions.join(', ')}`;
        console.log(this.colorOutput ? chalk.cyan(functionsText) : functionsText);
      }
    }
    
    // Performance warning
    if (duration > 1000) {
      const warning = '⚠️  SLOW QUERY WARNING (>1000ms)';
      console.log(this.colorOutput ? chalk.red.bold(warning) : warning);
    } else if (duration > 500) {
      const warning = '⚠️  Moderate duration (>500ms)';
      console.log(this.colorOutput ? chalk.yellow.bold(warning) : warning);
    }
    
    // Query text
    console.log('\n📝 Query:');
    console.log(this.colorOutput ? chalk.white(formattedQuery) : formattedQuery);
    
    // Parameters
    if (params && params.length > 0) {
      console.log('\n📋 Parameters:');
      params.forEach((param, index) => {
        const paramText = `  $${index + 1}: ${this.formatParameter(param)}`;
        console.log(this.colorOutput ? chalk.gray(paramText) : paramText);
      });
    }
    
    // Error handling
    if (error) {
      console.log('\n❌ Error:');
      console.log(this.colorOutput ? chalk.red(error.message) : error.message);
    }
    
    // Explain analyze results
    if (explainResult && this.debugMode) {
      console.log('\n📊 Query Plan:');
      this.logExplainAnalyze(explainResult);
    }
    
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Format SQL query for better readability
   */
  formatQuery(queryText, params = []) {
    let formatted = queryText
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/SELECT/gi, '\nSELECT')
      .replace(/FROM/gi, '\nFROM')
      .replace(/WHERE/gi, '\nWHERE')
      .replace(/AND/gi, '\n  AND')
      .replace(/OR/gi, '\n  OR')
      .replace(/ORDER BY/gi, '\nORDER BY')
      .replace(/GROUP BY/gi, '\nGROUP BY')
      .replace(/HAVING/gi, '\nHAVING')
      .replace(/LIMIT/gi, '\nLIMIT')
      .replace(/OFFSET/gi, '\nOFFSET')
      .replace(/INSERT INTO/gi, '\nINSERT INTO')
      .replace(/UPDATE/gi, '\nUPDATE')
      .replace(/SET/gi, '\nSET')
      .replace(/VALUES/gi, '\nVALUES')
      .replace(/DELETE FROM/gi, '\nDELETE FROM')
      .replace(/JOIN/gi, '\nJOIN')
      .replace(/LEFT JOIN/gi, '\nLEFT JOIN')
      .replace(/RIGHT JOIN/gi, '\nRIGHT JOIN')
      .replace(/INNER JOIN/gi, '\nINNER JOIN');

    // Highlight spatial functions
    const spatialFunctions = [
      'ST_DWithin', 'ST_Contains', 'ST_Intersects', 'ST_Distance', 
      'ST_MakePoint', 'ST_SetSRID', 'ST_Transform', 'ST_Buffer',
      'ST_Within', 'ST_Overlaps', 'ST_Touches', 'ST_Crosses'
    ];
    
    spatialFunctions.forEach(func => {
      const regex = new RegExp(`\\b${func}\\b`, 'gi');
      if (this.colorOutput) {
        formatted = formatted.replace(regex, chalk.magenta.bold(func));
      }
    });

    return formatted;
  }

  /**
   * Format parameter values for logging
   */
  formatParameter(param) {
    if (param === null) return 'NULL';
    if (param === undefined) return 'UNDEFINED';
    if (typeof param === 'string') return `'${param}'`;
    if (typeof param === 'object') return JSON.stringify(param);
    return String(param);
  }

  /**
   * Check if query contains spatial functions
   */
  isSpatialQuery(queryText) {
    const spatialPatterns = [
      /ST_DWithin/i,
      /ST_Contains/i,
      /ST_Intersects/i,
      /ST_Distance/i,
      /ST_MakePoint/i,
      /ST_SetSRID/i,
      /ST_Transform/i,
      /ST_Buffer/i,
      /ST_Within/i,
      /ST_Overlaps/i,
      /ST_Touches/i,
      /ST_Crosses/i,
      /geography/i,
      /geometry/i
    ];
    
    return spatialPatterns.some(pattern => pattern.test(queryText));
  }

  /**
   * Detect specific spatial functions in query
   */
  detectSpatialFunctions(queryText) {
    const functions = [
      'ST_DWithin', 'ST_Contains', 'ST_Intersects', 'ST_Distance',
      'ST_MakePoint', 'ST_SetSRID', 'ST_Transform', 'ST_Buffer',
      'ST_Within', 'ST_Overlaps', 'ST_Touches', 'ST_Crosses'
    ];
    
    return functions.filter(func => 
      new RegExp(`\\b${func}\\b`, 'i').test(queryText)
    );
  }

  /**
   * Log EXPLAIN ANALYZE results
   */
  logExplainAnalyze(explainResult) {
    if (!explainResult || !explainResult.rows) return;
    
    const plans = explainResult.rows.map(row => row['QUERY PLAN']).join('\n');
    
    // Check for index usage
    const indexUsed = /Index Scan|Bitmap Index Scan/i.test(plans);
    const spatialIndexUsed = /idx.*location|gist.*location|spatial/i.test(plans);
    
    if (indexUsed) {
      const indexMessage = '✅ Index scan detected';
      console.log(this.colorOutput ? chalk.green(indexMessage) : indexMessage);
      
      if (spatialIndexUsed) {
        const spatialMessage = '🌍 Spatial index used';
        console.log(this.colorOutput ? chalk.green.bold(spatialMessage) : spatialMessage);
      }
    } else {
      const warning = '⚠️  Sequential scan detected - consider adding index';
      console.log(this.colorOutput ? chalk.red.bold(warning) : warning);
    }
    
    // Extract execution time and cost
    const executionTimeMatch = plans.match(/actual time=([\d.]+)\.\.([\d.]+)/);
    const costMatch = plans.match(/cost=([\d.]+)\.\.([\d.]+)/);
    
    if (executionTimeMatch) {
      const execTime = `Execution time: ${executionTimeMatch[1]}..${executionTimeMatch[2]}ms`;
      console.log(this.colorOutput ? chalk.blue(execTime) : execTime);
    }
    
    if (costMatch) {
      const cost = `Cost: ${costMatch[1]}..${costMatch[2]}`;
      console.log(this.colorOutput ? chalk.blue(cost) : cost);
    }
    
    // Full plan
    console.log('\nFull execution plan:');
    console.log(this.colorOutput ? chalk.gray(plans) : plans);
  }

  /**
   * Log query statistics summary
   */
  logSummary(stats) {
    if (!this.enabled) return;
    
    console.log('\n' + '📊 QUERY STATISTICS SUMMARY '.padStart(50, '=').padEnd(80, '='));
    console.log(`Total queries: ${stats.totalQueries}`);
    console.log(`Spatial queries: ${stats.spatialQueries}`);
    console.log(`Average duration: ${stats.averageDuration.toFixed(2)}ms`);
    console.log(`Slow queries (>1000ms): ${stats.slowQueries}`);
    console.log(`Queries using indexes: ${stats.indexedQueries}`);
    console.log('='.repeat(80) + '\n');
  }
}

module.exports = QueryLogger;