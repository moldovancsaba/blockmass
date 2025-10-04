#!/bin/bash

# STEP Blockchain Server Start Script
# Loads environment variables and starts the server

export MONGODB_URI='mongodb+srv://moldovancsaba_blockmass:MbpKmyyRHDKMECXd@blockmass-cluster.1dzskdf.mongodb.net/step?retryWrites=true&w=majority&appName=blockmass-cluster'
export PORT=3002
export NODE_ENV=development
export GPS_MAX_ACCURACY_M=50
export PROOF_SPEED_LIMIT_MPS=15
export PROOF_MORATORIUM_MS=10000

echo "Starting STEP Blockchain Server..."
echo "MongoDB: blockmass-cluster.1dzskdf.mongodb.net/step"
echo "Port: $PORT"
echo ""

node dist/api/server.js
