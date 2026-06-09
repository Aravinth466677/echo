#!/bin/bash

# Echo Deployment Diagnosis Script
echo "🔍 Echo Deployment Diagnosis"
echo "=========================="

# Get your URLs
echo ""
read -p "Enter your Render backend URL (e.g., https://echo-backend-xyz.onrender.com): " BACKEND_URL
read -p "Enter your Vercel frontend URL (e.g., https://echo-frontend.vercel.app): " FRONTEND_URL

echo ""
echo "Testing deployment..."

# Test 1: Backend Health
echo "1. Testing backend health..."
curl -s "${BACKEND_URL}/health" | jq '.' 2>/dev/null || echo "❌ Backend health check failed"

# Test 2: Backend API Health
echo ""
echo "2. Testing backend API health..."
curl -s "${BACKEND_URL}/api/health" | jq '.' 2>/dev/null || echo "❌ Backend API health check failed"

# Test 3: Environment Check
echo ""
echo "3. Checking backend environment..."
curl -s "${BACKEND_URL}/api/debug/config" | jq '.' 2>/dev/null || echo "❌ Environment check failed (may be disabled in production)"

# Test 4: CORS Test
echo ""
echo "4. Testing CORS with your frontend domain..."
curl -s -H "Origin: ${FRONTEND_URL}" "${BACKEND_URL}/api/health" | jq '.' 2>/dev/null || echo "❌ CORS test failed"

# Test 5: Login Test
echo ""
echo "5. Testing login endpoint..."
curl -s -X POST "${BACKEND_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@echo.gov","password":"admin123"}' | jq '.' 2>/dev/null || echo "❌ Login test failed"

# Test 6: Frontend API Config
echo ""
echo "6. Checking if frontend can reach backend..."
curl -s "${FRONTEND_URL}" | grep -o "REACT_APP_API_URL[^<]*" || echo "❌ Cannot check frontend API config"

echo ""
echo "=========================="
echo "Diagnosis complete!"
echo ""
echo "💡 Common fixes:"
echo "- Set REACT_APP_API_URL=${BACKEND_URL} in Vercel"
echo "- Set CLIENT_URL=${FRONTEND_URL} in Render"  
echo "- Ensure DATABASE_URL is set in Render"
echo "- Set JWT_SECRET in Render (32+ characters)"
echo ""
echo "📋 Need help? Check the deployment guides!"