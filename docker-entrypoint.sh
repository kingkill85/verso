#!/bin/sh
set -e

# Ensure data directories exist and are owned by verso user
mkdir -p /data/files
chown -R verso:verso /data

# Drop to verso user and exec the CMD
exec gosu verso "$@"
