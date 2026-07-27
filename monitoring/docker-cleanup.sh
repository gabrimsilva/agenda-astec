#!/bin/bash
# Docker Cleanup Script - Run weekly
# Add to crontab: 0 2 * * 0 /path/to/docker-cleanup.sh

echo "[$(date)] Starting Docker cleanup..."

# Remove build cache
echo "Cleaning build cache..."
docker builder prune -af

# Remove unused images (older than 7 days)
echo "Cleaning old images..."
docker image prune -a --filter "until=168h" -f

# Remove unused volumes (be careful - this won't touch active volumes)
echo "Cleaning unused volumes..."
docker volume prune -f

# Remove stopped containers older than 24h
echo "Cleaning stopped containers..."
docker container prune --filter "until=24h" -f

# Show final state
echo "Final state:"
docker system df

# Log space freed
df -h / | grep -E '^/dev' | awk '{print "Disk: " $3 " used / " $2 " total (" $5 " used)"}'

echo "[$(date)] Cleanup completed"
