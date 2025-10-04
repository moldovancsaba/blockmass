#!/bin/bash

echo "🚀 Starting STEP Mesh API..."
echo ""

# Kill any existing processes
echo "1. Cleaning up old processes..."
lsof -ti:3002 | xargs kill -9 2>/dev/null
pkill -9 -f "tsx watch" 2>/dev/null
sleep 2

# Start the API in background
echo "2. Starting Mesh API on port 3002..."
cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
npm run dev > /tmp/mesh-api.log 2>&1 &
API_PID=$!
echo "   PID: $API_PID"

# Wait for it to start
echo "3. Waiting for API to start..."
sleep 5

# Test the API
echo "4. Testing API endpoints..."
echo ""

# Health check
echo "   📊 Health Check:"
curl -s http://localhost:3002/health | head -5
echo ""

# Triangle lookup
echo "   🔺 Triangle Lookup (Budapest):"
curl -s "http://localhost:3002/mesh/triangleAt?lat=47.4979&lon=19.0402&level=10" | head -10
echo ""

echo ""
echo "✅ API is running!"
echo ""
echo "📋 Useful commands:"
echo "   Test triangle: curl 'http://localhost:3002/mesh/triangleAt?lat=47.4979&lon=19.0402&level=10'"
echo "   View logs:     tail -f /tmp/mesh-api.log"
echo "   Stop API:      kill $API_PID"
echo ""
echo "🎯 Next: Open frontend mesh viewer"
echo "   cd /Users/moldovancsaba/Projects/blockmass/frontend"
echo "   npm run dev"
echo ""
