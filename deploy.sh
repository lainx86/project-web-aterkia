#!/bin/bash

# ATEROLAS Dashboard - Quick Deploy Script

set -e  # Exit on error

echo "ATEIROLAS Ship Monitoring Dashboard"
echo "========================================="
echo ""

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' 

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed!${NC}"
    echo "Please install Docker from: https://www.docker.com/get-started"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed!${NC}"
    echo "Please install Docker Compose"
    exit 1
fi

echo -e "${GREEN}Docker & Docker Compose detected${NC}"
echo ""

if [ "$(docker ps -q -f name=ateirolas)" ]; then
    echo -e "${YELLOW}⏹Stopping existing container...${NC}"
    docker-compose down
fi

echo -e "${BLUE}Building Docker image...${NC}"
docker-compose build

echo -e "${BLUE}Starting container...${NC}"
docker-compose up -d

echo -e "${BLUE}Waiting for container to be ready...${NC}"
sleep 5


if [ "$(docker ps -q -f name=ateirolas-dashboard)" ] && [ "$(docker ps -q -f name=asv-backend)" ]; then
    echo -e "${GREEN}All services are running!${NC}"
    echo ""
    echo "========================================="
    echo -e "${GREEN}Dashboard is LIVE!${NC}"
    echo "========================================="
    echo ""
    echo -e "Local Access:  ${BLUE}http://localhost:8080${NC}"
    echo ""
    
    if command -v ngrok &> /dev/null; then
        echo -e "${YELLOW}Want to deploy publicly with ngrok? (y/n)${NC}"
        read -r response
        
        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo ""
            echo -e "${BLUE}Starting ngrok tunnel...${NC}"
            echo -e "${YELLOW}Press Ctrl+C to stop ngrok${NC}"
            echo ""
            ngrok http 8080
        fi
    else
        echo -e "${YELLOW}Tip: Install ngrok for public access${NC}"
        echo "   https://ngrok.com/download"
        echo ""
        echo -e "${YELLOW}   Then run: ${NC}ngrok http 8080"
    fi
    
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
    echo -e "${RED}Failed to start container!${NC}"
    echo "Check logs with: docker-compose logs"
    exit 1
fi
