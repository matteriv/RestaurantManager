#!/bin/bash
# Post-installation script for Linux systems

# Update desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications
fi

# Update MIME database
if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime
fi

# Create application data directory
mkdir -p "$HOME/.config/RestaurantManager"
mkdir -p "$HOME/.local/share/RestaurantManager/logs"
mkdir -p "$HOME/.local/share/RestaurantManager/backups"

# Set proper permissions
chmod 755 /opt/RestaurantManager/restaurant-manager
chmod 644 /usr/share/applications/restaurant-manager.desktop

echo "Restaurant Manager has been installed successfully!"
echo "You can launch it from the applications menu or by running 'restaurant-manager' in the terminal."