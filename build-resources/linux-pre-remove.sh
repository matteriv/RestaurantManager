#!/bin/bash
# Pre-removal script for Linux systems

# Stop the application if it's running
pkill -f "restaurant-manager" || true

echo "Restaurant Manager is being removed..."