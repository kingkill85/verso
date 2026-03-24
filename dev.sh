#!/bin/bash
# Start Verso dev environment: server + web + Chrome in app mode

set -e

VITE_PORT=5173
VITE_URL="http://localhost:$VITE_PORT"

cleanup() {
  echo "Shutting down..."
  kill $SERVER_PID $WEB_PID 2>/dev/null
  wait $SERVER_PID $WEB_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Start server
pnpm dev:server &
SERVER_PID=$!

# Start web
pnpm dev:web &
WEB_PID=$!

# Wait for server to be ready
SERVER_URL="http://localhost:3000"
echo "Waiting for server on $SERVER_URL..."
until curl -s "$SERVER_URL/health" > /dev/null 2>&1; do
  sleep 0.5
done
echo "Server ready."

# Wait for Vite to be ready
echo "Waiting for Vite on $VITE_URL..."
until curl -s "$VITE_URL" > /dev/null 2>&1; do
  sleep 0.5
done
echo "Vite ready."

# Open Chrome with separate profile (normal window, not app mode)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE_DIR="$HOME/.verso-chrome-profile"
if [ -x "$CHROME" ]; then
  "$CHROME" \
    --user-data-dir="$PROFILE_DIR" \
    --auto-open-devtools-for-tabs \
    --window-size=1400,900 \
    "$VITE_URL" &
  echo "Chrome opened at $VITE_URL (devtools enabled)"
else
  echo "Chrome not found — open $VITE_URL manually"
fi

echo "Server PID: $SERVER_PID | Web PID: $WEB_PID"
echo "Press Ctrl+C to stop"
wait
