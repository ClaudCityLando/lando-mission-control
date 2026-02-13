#!/bin/bash
# dev-serve.sh — Run dev server with Tailscale network exposure
#
# Starts the Next.js dev server and exposes it on the tailnet via `tailscale serve`.
# Cleans up the serve entry automatically on exit (Ctrl+C, kill, etc.)
#
# Usage: ./scripts/dev-serve.sh [port]
#   port — port to serve (default: 3000)
#
# SECURITY: Uses `tailscale serve` (tailnet-only). NEVER use `tailscale funnel`.

PORT="${1:-3000}"
BIND_HOST="${STUDIO_BIND_HOST:-127.0.0.1}"

HOSTNAME=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName // empty' | sed 's/\.$//')

cleanup() {
  echo ""
  echo "Removing tailscale serve on port $PORT..."
  tailscale serve --https="$PORT" off 2>/dev/null || true
  echo "Cleaned up"
}

trap cleanup EXIT

echo "Starting mission-control with tailnet exposure"
echo "   Local:   http://${BIND_HOST}:$PORT"

# Set up tailscale serve (tailnet only — NOT funnel)
if tailscale serve --bg --https="$PORT" "http://${BIND_HOST}:$PORT"; then
  if [ -n "$HOSTNAME" ]; then
    echo "   Tailnet: https://${HOSTNAME}:$PORT"
  else
    echo "   Tailnet: enabled (couldn't detect hostname)"
  fi
else
  echo "   tailscale serve failed — running localhost only"
  echo "   Check tailscale status and tailscale serve status"
fi

echo ""

# Run the custom server in foreground. Trap fires on exit/Ctrl+C.
PORT="$PORT" HOST="$BIND_HOST" node server/index.js --dev
