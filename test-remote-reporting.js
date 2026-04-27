#!/usr/bin/env node

const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Test data
const testData = {
  // Same location (0m distance)
  sameLocation: {
    reporterLatitude: 17.385,
    reporterLongitude: 78.4867,
    issueLatitude: 17.385,
    issueLongitude: 78.4867
  },
  // Near location (500m distance)
  nearLocation: {
    reporterLatitude: 17.385,
    reporterLongitude: 78.4867,
    issueLatitude: 17.390,
    issueLongitude: 78.4867
  },
  // Medium distance (1.5km)
  mediumDistance: {
    reporterLatitude: 17.385,
    reporterLongitude: 78.4867,
    issueLatitude: 17.400,
    issueLongitude: 78.4867
  },
  // Far distance (4km)
  farDistance: {
    reporterLatitude: 17.385,
    reporterLongitude: 78.4867,
    issueLatitude: 17.420,
    issueLongitude: 78.4867
  },
  // Too far (7km)
  tooFar: {
    reporterLatitude: 17.385,
    reporterLongitude: 78.4867,
    issueLatitude: 17.450,
    issueLongitude: 78.4867
  }
};

async function testEndpoint(name, data) {
  try {
    console.log(`\\n=== Testing ${name} ===`);
    console.log(`Reporter: ${data.reporterLatitude}, ${data.reporterLongitude}`);
    console.log(`Issue: ${data.issueLatitude}, ${data.issueLongitude}`);
    
    const response = await axios.post(`${API_BASE}/complaints/validate-remote`, data);
    const result = response.data;
    
    console.log(`Distance: ${result.distanceFormatted}`);
    console.log(`Trust Level: ${result.validation.trustLevel}`);
    console.log(`Can Submit: ${result.validation.valid}`);
    console.log(`Requires Justification: ${result.validation.requiresJustification || false}`);
    
    if (result.validation.rules?.warningMessage) {
      console.log(`Warning: ${result.validation.rules.warningMessage}`);
    }
    
    if (!result.validation.valid) {
      console.log(`Block Reason: ${result.validation.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error testing ${name}:`, error.response?.data || error.message);
    return null;
  }
}

async function testJustificationOptions() {
  try {
    console.log('\\n=== Testing Justification Options ===');
    const response = await axios.get(`${API_BASE}/complaints/justification-options`);
    console.log('Available options:', response.data.options);
    return response.data.options;
  } catch (error) {
    console.error('Error getting justification options:', error.response?.data || error.message);
    return null;
  }
}

async function testReportingStats() {
  try {
    console.log('\\n=== Testing Reporting Stats (requires auth) ===');
    const response = await axios.get(`${API_BASE}/complaints/reporting-stats`);
    console.log('Reporting stats:', response.data.stats);
    return response.data.stats;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('Reporting stats endpoint requires authentication (expected)');
    } else {
      console.error('Error getting reporting stats:', error.response?.data || error.message);
    }
    return null;
  }
}

async function runTests() {
  console.log('🚀 Testing Dual-Mode Issue Reporting System');
  console.log('='.repeat(50));
  
  // Test validation endpoints
  await testEndpoint('Same Location (In-Place)', testData.sameLocation);
  await testEndpoint('Near Location (In-Place)', testData.nearLocation);
  await testEndpoint('Medium Distance (Near Remote)', testData.mediumDistance);
  await testEndpoint('Far Distance (Remote)', testData.farDistance);
  await testEndpoint('Too Far (Blocked)', testData.tooFar);
  
  // Test other endpoints
  await testJustificationOptions();
  await testReportingStats();
  
  console.log('\\n✅ Testing completed!');
  console.log('\\n📋 Summary of Distance Rules:');
  console.log('≤ 1km: In-Place (High Trust) - Direct submission');
  console.log('1-3km: Near Remote (Medium Trust) - Warning shown');
  console.log('3-5km: Remote (Low Trust) - Justification required');
  console.log('> 5km: Blocked (Unverified) - Submission blocked');
}

// Run the tests
runTests().catch(console.error);