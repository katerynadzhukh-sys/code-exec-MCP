#!/bin/sh
set -e

# Fix .tmp ownership if Docker created it as root via bind mount
chown -R mcp:mcp /app/.tmp 2>/dev/null || mkdir -p /app/.tmp

exec su-exec mcp "$@"
