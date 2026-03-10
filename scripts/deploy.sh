#!/bin/bash
set -euo pipefail

# --- Load .env from project root ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# --- Configuration from environment ---
: "${DEPLOY_USER:?Set DEPLOY_USER in .env or environment}"
: "${DEPLOY_HOST:?Set DEPLOY_HOST in .env or environment}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"

APP_NAME="alfredo"
REMOTE_DIR="/opt/$APP_NAME"
SERVICE_NAME="$APP_NAME"
LOCAL_BIN="dist/alfredo-linux-x64"

# --- Step 1: Compile for linux-x64 ---
echo "📦 Compiling for linux-x64..."
bun run compile:linux

if [ ! -f "$LOCAL_BIN" ]; then
  echo "❌ Binary not found at $LOCAL_BIN"
  exit 1
fi

echo "✅ Binary ready: $LOCAL_BIN ($(du -h "$LOCAL_BIN" | cut -f1))"

# --- Step 2: Copy binary to server ---
echo "📤 Uploading to $DEPLOY_USER@$DEPLOY_HOST..."
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "sudo mkdir -p $REMOTE_DIR"
scp -P "$DEPLOY_PORT" "$LOCAL_BIN" "$DEPLOY_USER@$DEPLOY_HOST:/tmp/$APP_NAME"
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "sudo mv /tmp/$APP_NAME $REMOTE_DIR/$APP_NAME && sudo chmod +x $REMOTE_DIR/$APP_NAME"

# --- Step 3: Create systemd service if it doesn't exist ---
echo "🔧 Configuring systemd service..."
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" bash <<REMOTE
set -euo pipefail

if [ ! -f /etc/systemd/system/$SERVICE_NAME.service ]; then
  sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Alfredo App
After=network.target

[Service]
Type=simple
ExecStart=$REMOTE_DIR/$APP_NAME
WorkingDirectory=$REMOTE_DIR
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable $SERVICE_NAME
  echo "✅ Service created and enabled"
else
  echo "ℹ️  Service already exists"
fi
REMOTE

# --- Step 4: Restart the service ---
echo "🚀 Restarting service..."
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl restart $SERVICE_NAME"

# --- Step 5: Check status ---
echo ""
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl status $SERVICE_NAME --no-pager -l" || true

echo ""
echo "✅ Deployed to $DEPLOY_HOST"
echo "   Logs: ssh $DEPLOY_USER@$DEPLOY_HOST 'journalctl -u $SERVICE_NAME -f'"
