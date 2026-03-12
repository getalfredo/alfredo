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
SERVICE_NAME="$APP_NAME"
LOCAL_BIN="dist/alfredo-linux-x64"

# APP_USER: the user that will own and run the app (default: alfredo)
# APP_USER_CREATE: set to "true" to create the user if it doesn't exist (default: false)
APP_USER="${APP_USER:-alfredo}"
APP_USER_CREATE="${APP_USER_CREATE:-false}"

REMOTE_DIR="/home/$APP_USER/app"

# --- Step 1: Compile for linux-x64 ---
echo "📦 Compiling for linux-x64..."
bun run compile:linux

if [ ! -f "$LOCAL_BIN" ]; then
  echo "❌ Binary not found at $LOCAL_BIN"
  exit 1
fi

echo "✅ Binary ready: $LOCAL_BIN ($(du -h "$LOCAL_BIN" | cut -f1))"

# --- Step 2: Ensure user and directory exist on server ---
echo "🔧 Configuring user '$APP_USER' on server..."
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" bash <<REMOTE
set -euo pipefail

if ! id -u $APP_USER &>/dev/null; then
  if [ "$APP_USER_CREATE" = "true" ]; then
    sudo useradd --create-home --shell /bin/bash $APP_USER
    echo "✅ User '$APP_USER' created with home /home/$APP_USER"
  else
    echo "❌ User '$APP_USER' does not exist. Set APP_USER_CREATE=true to create it, or use an existing user."
    exit 1
  fi
else
  echo "ℹ️  User '$APP_USER' already exists"
fi

sudo mkdir -p $REMOTE_DIR
sudo chown $APP_USER:$APP_USER $REMOTE_DIR
REMOTE

# --- Step 3: Upload binary ---
echo "📤 Uploading to $DEPLOY_USER@$DEPLOY_HOST:$REMOTE_DIR..."
scp -P "$DEPLOY_PORT" "$LOCAL_BIN" "$DEPLOY_USER@$DEPLOY_HOST:/tmp/$APP_NAME"
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "sudo mv /tmp/$APP_NAME $REMOTE_DIR/$APP_NAME && sudo chown $APP_USER:$APP_USER $REMOTE_DIR/$APP_NAME && sudo chmod +x $REMOTE_DIR/$APP_NAME"

# --- Step 4: Create or update systemd service ---
echo "🔧 Configuring systemd service..."
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" bash <<REMOTE
set -euo pipefail

sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Alfredo App
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
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
echo "✅ Service configured (runs as $APP_USER)"
REMOTE

# --- Step 5: Restart the service ---
echo "🚀 Restarting service..."
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl restart $SERVICE_NAME"

# --- Step 6: Check status ---
echo ""
ssh -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl status $SERVICE_NAME --no-pager -l" || true

echo ""
echo "✅ Deployed to $DEPLOY_HOST (running as $APP_USER)"
echo "   Binary: $REMOTE_DIR/$APP_NAME"
echo "   Logs:   ssh $DEPLOY_USER@$DEPLOY_HOST 'journalctl -u $SERVICE_NAME -f'"
