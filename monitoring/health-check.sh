#!/bin/bash
# Health Check Script for ASTEC VM
# Run this hourly via cron: 0 * * * * /path/to/health-check.sh

LOG_FILE="/var/log/astec-health.log"
ALERT_EMAIL="ti@empresa.com.br"  # Substitua pelo email real
DISK_THRESHOLD=75
RAM_THRESHOLD=85
SWAP_THRESHOLD=50

# Get current metrics
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
RAM_USAGE=$(free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}')
SWAP_USAGE=$(free | awk 'NR==3 {if($2>0) printf "%.0f", $3/$2 * 100; else print 0}')
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
DOCKER_RUNNING=$(docker ps -q | wc -l)
APP_STATUS=$(docker ps --filter name=astec-app --format "{{.Status}}" | grep -c "Up")

# Log timestamp
echo "[$(date '+%Y-%m-%d %H:%M:%S')]" >> "$LOG_FILE"

# Check disk space
if [ "$DISK_USAGE" -gt "$DISK_THRESHOLD" ]; then
    echo "⚠️ ALERT: Disk usage at ${DISK_USAGE}% (threshold: ${DISK_THRESHOLD}%)" | tee -a "$LOG_FILE"
    # Auto cleanup
    docker builder prune -af > /dev/null 2>&1
    docker image prune -a --filter "until=168h" -f > /dev/null 2>&1
    echo "✅ Auto cleanup executed" >> "$LOG_FILE"
fi

# Check RAM
if [ "$RAM_USAGE" -gt "$RAM_THRESHOLD" ]; then
    echo "⚠️ ALERT: RAM usage at ${RAM_USAGE}% (threshold: ${RAM_THRESHOLD}%)" | tee -a "$LOG_FILE"
fi

# Check swap (indicates memory pressure)
if [ "$SWAP_USAGE" -gt "$SWAP_THRESHOLD" ]; then
    echo "⚠️ ALERT: Swap usage at ${SWAP_USAGE}% - possible memory leak" | tee -a "$LOG_FILE"
fi

# Check if astec-app is running
if [ "$APP_STATUS" -eq 0 ]; then
    echo "🔴 CRITICAL: ASTEC app is DOWN!" | tee -a "$LOG_FILE"
    # Auto restart
    cd ~/agenda-astec && docker compose up -d
    echo "🔄 Auto restart attempted" >> "$LOG_FILE"
fi

# Log metrics
echo "📊 Metrics: Disk=${DISK_USAGE}%, RAM=${RAM_USAGE}%, Swap=${SWAP_USAGE}%, Load=${LOAD_AVG}, Containers=${DOCKER_RUNNING}" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"
