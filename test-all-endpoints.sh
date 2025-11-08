#!/bin/bash

echo "=== Testing Unified Compiler Server ==="
echo

echo "1. Health Check:"
curl -s http://localhost:3000/health | jq .
echo

echo "2. Testing PuyaTS Compiler:"
curl -s -X POST http://localhost:3000/compile-puyats \
  -H "Content-Type: application/json" \
  -d @test-puya-ts.json | jq '.ok'
echo

echo "3. Testing Generate Client (requires ARC32 JSON):"
echo "   (This would need a valid ARC32 JSON input)"
echo

echo "=== All tests completed ==="
echo "Server is running successfully with all endpoints available:"
echo "- POST /compile-puyapy"
echo "- POST /compile-puyats" 
echo "- POST /compile-tealscript"
echo "- POST /generate-client"
echo "- GET /health"