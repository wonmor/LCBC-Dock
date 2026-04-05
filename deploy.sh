#!/bin/bash
set -e

echo "=== LCBC Dock — CapRover Deploy ==="
echo ""

# Deploy frontend
echo "[1/2] Deploying frontend..."
cp captain-definition captain-definition.bak
cp captain-definition captain-definition  # already points to frontend
caprover deploy
echo "Frontend deployed."
echo ""

# Deploy backend
echo "[2/2] Deploying backend..."
cp captain-definition-backend captain-definition
caprover deploy
echo "Backend deployed."

# Restore frontend captain-definition
cp captain-definition.bak captain-definition
rm captain-definition.bak

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Don't forget to configure in CapRover dashboard:"
echo "  - Backend env vars: SMTP_USER, SMTP_PASS, FROM_EMAIL, BASE_URL"
echo "  - Backend persistent storage: /app/data"
