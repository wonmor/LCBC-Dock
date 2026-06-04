#!/bin/bash
set -e

CAPROVER_URL="https://captain.apps.johnseong.com"
FRONTEND_APP="lcbc-client"
BACKEND_APP="lcbc-server"
FRONTEND_DEF='{"schemaVersion":2,"dockerfilePath":"./Dockerfile.frontend"}'
BACKEND_DEF='{"schemaVersion":2,"dockerfilePath":"./Dockerfile.backend"}'

usage() {
  echo "Usage: bash deploy.sh [frontend|backend|all]"
  echo ""
  echo "  frontend  — Deploy web frontend only"
  echo "  backend   — Deploy backend server only"
  echo "  all       — Deploy both (default)"
  exit 1
}

deploy_frontend() {
  echo "[frontend] Setting captain-definition → Dockerfile.frontend"
  echo "$FRONTEND_DEF" > captain-definition

  echo "[frontend] Creating tarball..."
  # Keep the upload small (CapRover nginx rejects large bodies with 413).
  # Neither the web frontend nor the Python backend image needs the
  # Next build cache, the native app trees, or marketing assets.
  tar -cf /tmp/lcbc-deploy.tar \
    --exclude='node_modules' --exclude='.git' \
    --exclude='./.next' --exclude='./mobile' --exclude='./macos' \
    --exclude='./desktop' --exclude='./screenshots' --exclude='./docs' .

  echo "[frontend] Deploying to $FRONTEND_APP..."
  caprover deploy --caproverUrl "$CAPROVER_URL" --caproverApp "$FRONTEND_APP" --tarFile /tmp/lcbc-deploy.tar

  rm -f /tmp/lcbc-deploy.tar
  echo "[frontend] Done."
}

deploy_backend() {
  echo "[backend] Setting captain-definition → Dockerfile.backend"
  echo "$BACKEND_DEF" > captain-definition

  echo "[backend] Creating tarball..."
  # Keep the upload small (CapRover nginx rejects large bodies with 413).
  # Neither the web frontend nor the Python backend image needs the
  # Next build cache, the native app trees, or marketing assets.
  tar -cf /tmp/lcbc-deploy.tar \
    --exclude='node_modules' --exclude='.git' \
    --exclude='./.next' --exclude='./mobile' --exclude='./macos' \
    --exclude='./desktop' --exclude='./screenshots' --exclude='./docs' .

  echo "[backend] Deploying to $BACKEND_APP..."
  caprover deploy --caproverUrl "$CAPROVER_URL" --caproverApp "$BACKEND_APP" --tarFile /tmp/lcbc-deploy.tar

  rm -f /tmp/lcbc-deploy.tar
  echo "[backend] Done."
}

restore() {
  echo ""
  echo "[cleanup] Restoring captain-definition to frontend default"
  echo "$FRONTEND_DEF" > captain-definition
}

TARGET="${1:-all}"

echo "=== DockIt — CapRover Deploy ==="
echo ""

case "$TARGET" in
  frontend)
    deploy_frontend
    ;;
  backend)
    deploy_backend
    restore
    ;;
  all)
    deploy_frontend
    echo ""
    deploy_backend
    restore
    ;;
  *)
    usage
    ;;
esac

echo ""
echo "=== Deploy complete ==="
