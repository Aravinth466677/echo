class GPSAccuracyMonitor {
  constructor(options = {}) {
    this.targetAccuracy = options.targetAccuracy || 20; // meters
    this.maxWaitTime = options.maxWaitTime || 60000; // 60 seconds
    this.updateInterval = options.updateInterval || 1000; // 1 second
    this.fallbackAccuracy = options.fallbackAccuracy || 100; // Accept if we get this good
    
    this.watchId = null;
    this.startTime = null;
    this.bestAccuracy = Infinity;
    this.bestPosition = null;
    this.currentPosition = null;
    this.accuracyHistory = [];
    this.isMonitoring = false;
    
    // Callbacks
    this.onUpdate = null;
    this.onSuccess = null;
    this.onTimeout = null;
    this.onError = null;
    this.onProgress = null;
  }

  // Start monitoring GPS accuracy
  async startMonitoring() {
    return new Promise((resolve, reject) => {
      if (this.isMonitoring) {
        reject(new Error('Already monitoring GPS accuracy'));
        return;
      }

      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by this browser'));
        return;
      }

      this.isMonitoring = true;
      this.startTime = Date.now();
      this.bestAccuracy = Infinity;
      this.bestPosition = null;
      this.accuracyHistory = [];

      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      };

      // Set up success/error handlers
      this.onSuccess = resolve;
      this.onError = reject;

      // Start watching position
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handlePositionUpdate(position),
        (error) => this.handleError(error),
        options
      );

      // Set timeout
      this.timeoutId = setTimeout(() => {
        this.handleTimeout();
      }, this.maxWaitTime);

      // Initial status
      this.notifyProgress({
        status: 'starting',
        message: 'Starting GPS accuracy monitoring...',
        elapsed: 0,
        targetAccuracy: this.targetAccuracy
      });
    });
  }

  handlePositionUpdate(position) {
    const accuracy = position.coords.accuracy;
    const elapsed = Date.now() - this.startTime;
    
    this.currentPosition = position;
    this.accuracyHistory.push({
      accuracy,
      timestamp: Date.now(),
      position: {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }
    });

    // Keep only last 20 readings
    if (this.accuracyHistory.length > 20) {
      this.accuracyHistory.shift();
    }

    // Track best accuracy
    if (accuracy < this.bestAccuracy) {
      this.bestAccuracy = accuracy;
      this.bestPosition = position;
    }

    // Calculate improvement trend
    const trend = this.calculateAccuracyTrend();
    const progress = this.calculateProgress(accuracy, elapsed);

    // Notify progress
    this.notifyProgress({
      status: 'monitoring',
      currentAccuracy: Math.round(accuracy),
      bestAccuracy: Math.round(this.bestAccuracy),
      targetAccuracy: this.targetAccuracy,
      elapsed,
      remaining: Math.max(0, this.maxWaitTime - elapsed),
      progress: progress.percentage,
      trend,
      message: this.getStatusMessage(accuracy, elapsed, trend)
    });

    // Check if we've reached target accuracy
    if (accuracy <= this.targetAccuracy) {
      this.handleSuccess(position, 'target_reached');
      return;
    }

    // Check if we should accept fallback accuracy near timeout
    if (elapsed > this.maxWaitTime * 0.8 && accuracy <= this.fallbackAccuracy) {
      this.handleSuccess(position, 'fallback_accepted');
      return;
    }

    // Notify update callback
    if (this.onUpdate) {
      this.onUpdate({
        position,
        accuracy: Math.round(accuracy),
        bestAccuracy: Math.round(this.bestAccuracy),
        elapsed,
        trend
      });
    }
  }

  handleSuccess(position, reason) {
    this.cleanup();
    
    const result = {
      success: true,
      position,
      accuracy: Math.round(position.coords.accuracy),
      bestAccuracy: Math.round(this.bestAccuracy),
      elapsed: Date.now() - this.startTime,
      reason,
      accuracyHistory: this.accuracyHistory,
      message: this.getSuccessMessage(position.coords.accuracy, reason)
    };

    if (this.onSuccess) {
      this.onSuccess(result);
    }
  }

  handleTimeout() {
    this.cleanup();
    
    const result = {
      success: false,
      reason: 'timeout',
      bestPosition: this.bestPosition,
      bestAccuracy: Math.round(this.bestAccuracy),
      currentPosition: this.currentPosition,
      currentAccuracy: this.currentPosition ? Math.round(this.currentPosition.coords.accuracy) : null,
      elapsed: this.maxWaitTime,
      accuracyHistory: this.accuracyHistory,
      message: this.getTimeoutMessage()
    };

    if (this.onTimeout) {
      this.onTimeout(result);
    } else if (this.onError) {
      this.onError(new Error(`GPS accuracy timeout. Best accuracy: ${result.bestAccuracy}m`));
    }
  }

  handleError(error) {
    this.cleanup();
    
    const gpsError = {
      success: false,
      reason: 'gps_error',
      error: error.message,
      code: error.code,
      elapsed: Date.now() - this.startTime,
      message: this.getErrorMessage(error)
    };

    if (this.onError) {
      this.onError(gpsError);
    }
  }

  calculateAccuracyTrend() {
    if (this.accuracyHistory.length < 3) {
      return { trend: 'unknown', confidence: 'low' };
    }

    const recent = this.accuracyHistory.slice(-5); // Last 5 readings
    const older = this.accuracyHistory.slice(-10, -5); // Previous 5 readings

    if (older.length === 0) {
      return { trend: 'unknown', confidence: 'low' };
    }

    const recentAvg = recent.reduce((sum, r) => sum + r.accuracy, 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + r.accuracy, 0) / older.length;

    const improvement = olderAvg - recentAvg;
    const improvementPercent = (improvement / olderAvg) * 100;

    if (improvementPercent > 10) {
      return { trend: 'improving', confidence: 'high', improvement: Math.round(improvementPercent) };
    } else if (improvementPercent < -10) {
      return { trend: 'degrading', confidence: 'high', degradation: Math.round(Math.abs(improvementPercent)) };
    } else {
      return { trend: 'stable', confidence: 'medium', variation: Math.round(Math.abs(improvementPercent)) };
    }
  }

  calculateProgress(currentAccuracy, elapsed) {
    // Progress based on accuracy improvement
    const accuracyProgress = Math.max(0, Math.min(100, 
      ((1000 - currentAccuracy) / (1000 - this.targetAccuracy)) * 100
    ));

    // Progress based on time
    const timeProgress = (elapsed / this.maxWaitTime) * 100;

    // Combined progress (weighted toward accuracy)
    const combinedProgress = (accuracyProgress * 0.7) + (timeProgress * 0.3);

    return {
      percentage: Math.round(combinedProgress),
      accuracyProgress: Math.round(accuracyProgress),
      timeProgress: Math.round(timeProgress)
    };
  }

  getStatusMessage(accuracy, elapsed, trend) {
    const seconds = Math.round(elapsed / 1000);
    const accuracyRounded = Math.round(accuracy);

    if (accuracyRounded <= 5) {
      return `🎯 Excellent GPS signal (${accuracyRounded}m) - Almost there!`;
    } else if (accuracyRounded <= 20) {
      return `✅ Good GPS signal (${accuracyRounded}m) - Target reached!`;
    } else if (accuracyRounded <= 50) {
      return `📍 Fair GPS signal (${accuracyRounded}m) - ${trend.trend === 'improving' ? 'Improving!' : 'Getting closer...'}`;
    } else if (accuracyRounded <= 200) {
      return `⚠️ Poor GPS signal (${accuracyRounded}m) - ${trend.trend === 'improving' ? 'Improving steadily' : 'Still searching...'}`;
    } else if (accuracyRounded <= 1000) {
      return `🔍 Very poor GPS signal (${accuracyRounded}m) - ${seconds}s elapsed`;
    } else {
      return `❌ Extremely poor GPS signal (${accuracyRounded}m) - Consider moving to open area`;
    }
  }

  getSuccessMessage(accuracy, reason) {
    const accuracyRounded = Math.round(accuracy);
    
    if (reason === 'target_reached') {
      return `🎯 Perfect! GPS accuracy reached ${accuracyRounded}m (target: ${this.targetAccuracy}m)`;
    } else if (reason === 'fallback_accepted') {
      return `✅ Good enough! GPS accuracy ${accuracyRounded}m accepted (fallback: ${this.fallbackAccuracy}m)`;
    }
    
    return `✅ GPS accuracy achieved: ${accuracyRounded}m`;
  }

  getTimeoutMessage() {
    if (this.bestAccuracy < this.fallbackAccuracy) {
      return `⏰ Timeout reached, but best accuracy (${Math.round(this.bestAccuracy)}m) is acceptable. Use this location?`;
    } else {
      return `⏰ Timeout reached. Best accuracy: ${Math.round(this.bestAccuracy)}m. Consider manual location selection.`;
    }
  }

  getErrorMessage(error) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return "❌ Location access denied. Please enable location permissions.";
      case error.POSITION_UNAVAILABLE:
        return "❌ Location unavailable. Check if GPS is enabled.";
      case error.TIMEOUT:
        return "⏰ Location request timed out. Try again or move to open area.";
      default:
        return `❌ GPS error: ${error.message}`;
    }
  }

  notifyProgress(progressData) {
    if (this.onProgress) {
      this.onProgress(progressData);
    }
  }

  // Stop monitoring
  stop() {
    this.cleanup();
    return {
      stopped: true,
      bestAccuracy: Math.round(this.bestAccuracy),
      bestPosition: this.bestPosition,
      elapsed: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  cleanup() {
    this.isMonitoring = false;
    
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // Get current status
  getStatus() {
    if (!this.isMonitoring) {
      return { monitoring: false };
    }

    const elapsed = Date.now() - this.startTime;
    const currentAccuracy = this.currentPosition?.coords.accuracy;

    return {
      monitoring: true,
      elapsed,
      remaining: Math.max(0, this.maxWaitTime - elapsed),
      currentAccuracy: currentAccuracy ? Math.round(currentAccuracy) : null,
      bestAccuracy: Math.round(this.bestAccuracy),
      targetAccuracy: this.targetAccuracy,
      readingsCount: this.accuracyHistory.length,
      trend: this.calculateAccuracyTrend()
    };
  }

  // Static helper method for quick usage
  static async waitForAccuracy(targetAccuracy = 20, maxWaitTime = 60000) {
    const monitor = new GPSAccuracyMonitor({ targetAccuracy, maxWaitTime });
    return monitor.startMonitoring();
  }
}

// Export for use in React/frontend
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GPSAccuracyMonitor;
} else if (typeof window !== 'undefined') {
  window.GPSAccuracyMonitor = GPSAccuracyMonitor;
}

export default GPSAccuracyMonitor;