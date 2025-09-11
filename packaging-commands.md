# Windows Packaging System - Build Commands

Since the package.json cannot be modified directly, here are the commands you need to add to your package.json scripts section:

## Development Scripts
```json
"electron": "electron .",
"electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:5000 && electron .\"",
```

## Build Scripts
```json
"electron:pack": "npm run build && electron-builder --publish=never",
"electron:dist": "npm run build && electron-builder --publish=always",
```

## Windows Packaging Scripts
```json
"pack:win": "npm run build && electron-builder --win --publish=never",
"pack:win:msi": "npm run build && electron-builder --win msi --publish=never",
"pack:win:nsis": "npm run build && electron-builder --win nsis --publish=never",
"pack:win:portable": "npm run build && electron-builder --win portable --publish=never",
"pack:win:all": "npm run build && electron-builder --win --publish=never",
```

## macOS Packaging Scripts
```json
"pack:mac": "npm run build && electron-builder --mac --publish=never",
"pack:mac:dmg": "npm run build && electron-builder --mac dmg --publish=never",
"pack:mac:zip": "npm run build && electron-builder --mac zip --publish=never",
```

## Linux Packaging Scripts
```json
"pack:linux": "npm run build && electron-builder --linux --publish=never",
"pack:linux:appimage": "npm run build && electron-builder --linux AppImage --publish=never",
"pack:linux:deb": "npm run build && electron-builder --linux deb --publish=never",
"pack:linux:rpm": "npm run build && electron-builder --linux rpm --publish=never",
"pack:linux:snap": "npm run build && electron-builder --linux snap --publish=never",
```

## Distribution Scripts
```json
"dist:win": "npm run build && electron-builder --win --publish=always",
"dist:mac": "npm run build && electron-builder --mac --publish=always",
"dist:linux": "npm run build && electron-builder --linux --publish=always",
"dist:all": "npm run build && electron-builder --win --mac --linux --publish=always",
```

## Utility Scripts
```json
"clean": "rimraf dist dist-electron build-resources/node_modules",
"clean:all": "rimraf dist dist-electron build-resources/node_modules node_modules",
"rebuild": "npm run clean && npm install && npm run build",
"postinstall": "electron-builder install-app-deps",
"release": "npm run build && electron-builder --publish=always"
```

## How to Use

### Development
Run the app in development mode with Electron:
```bash
npm run electron:dev
```

### Building for Windows
Create Windows MSI installer:
```bash
npm run pack:win:msi
```

Create Windows NSIS installer:
```bash
npm run pack:win:nsis
```

Create Windows portable app:
```bash
npm run pack:win:portable
```

Create all Windows formats:
```bash
npm run pack:win:all
```

### Manual Command Examples
If you prefer to run commands directly:

```bash
# Build the application first
npm run build

# Create Windows MSI installer
npx electron-builder --win msi

# Create Windows NSIS installer
npx electron-builder --win nsis

# Create Windows portable app
npx electron-builder --win portable

# Create all Windows formats
npx electron-builder --win
```

## Output Location
Built packages will be created in the `dist-electron/` directory with the following structure:
- `dist-electron/win-unpacked/` - Unpacked Windows app
- `dist-electron/RestaurantManager-1.0.0-win.exe` - NSIS installer
- `dist-electron/RestaurantManager-1.0.0.msi` - MSI installer
- `dist-electron/RestaurantManager-1.0.0-portable.exe` - Portable executable