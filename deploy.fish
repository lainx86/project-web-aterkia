#!/usr/bin/env fish

# ============================================================
# ATEROLAS Dashboard - Quick Deploy Script
# ============================================================

echo "🚢 ATEIROLAS Ship Monitoring Dashboard"
echo "========================================="
echo ""

# Colors
set GREEN '\033[0;32m'
set BLUE '\033[0;34m'
set YELLOW '\033[1;33m'
set RED '\033[0;31m'
set NC '\033[0m' # No Color

# Check if Docker is installed
if not command -v docker > /dev/null 2>&1
    echo -e $RED"❌ Docker is not installed!"$NC
    echo "Please install Docker from: https://www.docker.com/get-started"
    exit 1
end

# Check if Docker Compose is installed
if not command -v docker-compose > /dev/null 2>&1
    echo -e $RED"❌ Docker Compose is not installed!"$NC
    echo "Please install Docker Compose"
    exit 1
end

echo -e $GREEN"✅ Docker & Docker Compose detected"$NC
echo ""

# Stop existing container if running
if test -n (docker ps -q -f name=ateirolas 2>/dev/null | string collect)
    echo -e $YELLOW"⏹️  Stopping existing container..."$NC
    docker-compose down
end

# Build and start
echo -e $BLUE"🔨 Building Docker image..."$NC
docker-compose build
or exit 1

echo -e $BLUE"🚀 Starting container..."$NC
docker-compose up -d
or exit 1

# Wait for container to be healthy
echo -e $BLUE"⏳ Waiting for container to be ready..."$NC
sleep 5

# Check if containers are running
set dashboard_running (docker ps -q -f name=ateirolas-dashboard 2>/dev/null | string collect)
set backend_running (docker ps -q -f name=asv-backend 2>/dev/null | string collect)

if test -n "$dashboard_running" -a -n "$backend_running"
    echo -e $GREEN"✅ All services are running!"$NC
    echo ""
    echo "========================================="
    echo -e $GREEN"🎉 Dashboard is LIVE!"$NC
    echo "========================================="
    echo ""
    echo -e "📍 Local Access:  "$BLUE"http://localhost:8080"$NC
    echo ""

    # Check if ngrok is installed
    if command -v ngrok > /dev/null 2>&1
        echo -e $YELLOW"🌐 Want to deploy publicly with ngrok? (y/n)"$NC
        read -l response

        if string match -qr '^[Yy]$' -- $response
            echo ""
            echo -e $BLUE"🚀 Starting ngrok tunnel..."$NC
            echo -e $YELLOW"Press Ctrl+C to stop ngrok"$NC
            echo ""
            ngrok http 8080
        end
    else
        echo -e $YELLOW"💡 Tip: Install ngrok for public access"$NC
        echo "   https://ngrok.com/download"
        echo ""
        echo -e $YELLOW"   Then run: "$NC"ngrok http 8080"
    end

    echo ""
    echo "========================================="
    echo "Useful Commands:"
    echo "========================================="
    echo "  View logs:    docker-compose logs -f"
    echo "  Stop:         docker-compose down"
    echo "  Restart:      docker-compose restart"
    echo "  Rebuild:      docker-compose up -d --build"
    echo ""

else
    echo -e $RED"❌ Failed to start container!"$NC
    echo "Check logs with: docker-compose logs"
    exit 1
end
