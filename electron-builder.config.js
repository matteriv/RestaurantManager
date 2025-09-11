const { execSync } = require('child_process');

// Get current git commit hash for version suffix
let gitCommitHash = '';
try {
  gitCommitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (error) {
  gitCommitHash = 'unknown';
}

module.exports = {
  appId: 'com.restaurant.management',
  productName: 'Restaurant Manager',
  copyright: 'Copyright © 2025 Restaurant Management System',
  
  // Main entry point
  main: 'electron/main.js',
  
  // Directories
  directories: {
    output: 'dist-electron',
    buildResources: 'build-resources'
  },
  
  // Files to include/exclude  
  files: [
    'dist/**/*',
    'electron/**/*',
    'package.json',
    '!node_modules/.cache/**/*',
    '!.cache/**/*'
  ],
  
  // Disable asar to avoid symlink issues in containerized environments
  asar: false,
  
  extraResources: [
    {
      from: 'build-resources',
      to: 'resources'
    }
  ],
  
  // Build settings
  buildVersion: gitCommitHash,
  
  // Windows configuration
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'ia32']
      },
      {
        target: 'msi',
        arch: ['x64', 'ia32']
      },
      {
        target: 'portable',
        arch: ['x64', 'ia32']
      }
    ],
    icon: 'build-resources/icon.ico',
    publisherName: 'Restaurant Management System',
    requestedExecutionLevel: 'asInvoker',
    
    // File associations
    fileAssociations: [
      {
        ext: 'rmenu',
        name: 'Restaurant Menu File',
        description: 'Restaurant menu configuration file',
        icon: 'build-resources/menu-icon.ico'
      }
    ]
  },
  
  // NSIS installer configuration (Windows)
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    installerIcon: 'build-resources/installer.ico',
    uninstallerIcon: 'build-resources/uninstaller.ico',
    installerHeaderIcon: 'build-resources/installer-header.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Restaurant Manager',
    
    // Custom NSIS script includes
    include: 'build-resources/installer.nsh',
    
    // Installer languages
    installerLanguages: ['en_US', 'es_ES', 'fr_FR', 'it_IT'],
    
    // License
    license: 'LICENSE.txt',
    
    // Multi-language support
    menuCategory: 'Restaurant Management'
  },
  
  // MSI installer configuration (Windows)
  msi: {
    oneClick: false,
    perMachine: true,
    allowDowngrade: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Restaurant Manager',
    
    // MSI upgrade code (keep this consistent across versions for proper upgrades)
    upgradeCode: '{12345678-1234-1234-1234-123456789012}',
    
    // Custom MSI properties
    additionalWixArgs: [
      '-ext', 'WixUtilExtension',
      '-ext', 'WixUIExtension'
    ],
    
    // Registry entries
    registry: [
      {
        hive: 'HKLM',
        key: 'SOFTWARE\\RestaurantManager',
        name: 'InstallPath',
        value: '[INSTALLDIR]'
      },
      {
        hive: 'HKLM', 
        key: 'SOFTWARE\\RestaurantManager',
        name: 'Version',
        value: '[PRODUCTVERSION]'
      }
    ]
  },
  
  // Portable app configuration (Windows)
  portable: {
    artifactName: 'RestaurantManager-${version}-portable.${ext}'
  },
  
  // macOS configuration
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'build-resources/icon.icns',
    category: 'public.app-category.business',
    darkModeSupport: true,
    
    // Code signing
    identity: process.env.APPLE_IDENTITY || null,
    provisioningProfile: process.env.APPLE_PROVISIONING_PROFILE || null,
    
    // Entitlements
    entitlements: 'build-resources/entitlements.mac.plist',
    entitlementsInherit: 'build-resources/entitlements.mac.plist',
    
    // Bundle configuration
    bundleVersion: gitCommitHash,
    minimumSystemVersion: '10.15.0',
    
    // File associations
    fileAssociations: [
      {
        ext: 'rmenu',
        name: 'Restaurant Menu File',
        description: 'Restaurant menu configuration file',
        icon: 'build-resources/menu-icon.icns',
        role: 'Editor'
      }
    ]
  },
  
  // DMG configuration (macOS)
  dmg: {
    sign: false,
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications'
      }
    ],
    background: 'build-resources/dmg-background.png',
    iconSize: 80,
    window: {
      width: 540,
      height: 380
    }
  },
  
  // Linux configuration
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      },
      {
        target: 'rpm',
        arch: ['x64']
      },
      {
        target: 'snap',
        arch: ['x64']
      }
    ],
    icon: 'build-resources/icon.png',
    category: 'Office',
    description: 'Complete restaurant management system with POS, kitchen display, and analytics',
    
    // Desktop integration
    desktop: {
      Name: 'Restaurant Manager',
      Comment: 'Restaurant Management System',
      Keywords: 'restaurant;pos;management;kitchen;orders',
      StartupNotify: 'true',
      MimeType: 'application/x-restaurant-menu'
    },
    
    // File associations
    fileAssociations: [
      {
        ext: 'rmenu',
        name: 'Restaurant Menu File',
        description: 'Restaurant menu configuration file',
        mimeType: 'application/x-restaurant-menu'
      }
    ]
  },
  
  // AppImage configuration (Linux)
  appImage: {
    artifactName: 'RestaurantManager-${version}-${arch}.${ext}'
  },
  
  // Debian package configuration (Linux)
  deb: {
    priority: 'optional',
    depends: [
      'libgtk-3-0',
      'libdrm2',
      'libxss1',
      'libgconf-2-4'
    ],
    recommends: [
      'libappindicator3-1'
    ],
    afterInstall: 'build-resources/linux-post-install.sh',
    beforeRemove: 'build-resources/linux-pre-remove.sh'
  },
  
  // RPM package configuration (Linux)
  rpm: {
    depends: [
      'gtk3',
      'libdrm',
      'libXScrnSaver',
      'GConf2'
    ],
    afterInstall: 'build-resources/linux-post-install.sh',
    beforeRemove: 'build-resources/linux-pre-remove.sh'
  },
  
  // Snap package configuration (Linux)
  snap: {
    grade: 'stable',
    confinement: 'strict',
    plugs: [
      'default',
      'network',
      'network-bind',
      'home',
      'desktop',
      'desktop-legacy',
      'x11',
      'unity7',
      'browser-support',
      'gsettings',
      'pulseaudio',
      'removable-media'
    ],
    environment: {
      TMPDIR: '$XDG_RUNTIME_DIR'
    }
  },
  
  // Auto-updater configuration
  publish: [
    {
      provider: 'github',
      owner: 'restaurant-manager',
      repo: 'restaurant-management-system',
      private: false,
      releaseType: 'release'
    }
  ],
  
  // Compression
  compression: 'maximum',
  
  // Build artifacts naming
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  
  // Force rebuild
  forceCodeSigning: false,
  
  // Build configuration
  buildDependenciesFromSource: false,
  nodeGypRebuild: false,
  npmRebuild: true,
  
  // Extend info for additional metadata
  extraMetadata: {
    homepage: 'https://github.com/restaurant-manager/restaurant-management-system',
    repository: {
      type: 'git',
      url: 'https://github.com/restaurant-manager/restaurant-management-system.git'
    },
    bugs: {
      url: 'https://github.com/restaurant-manager/restaurant-management-system/issues'
    },
    keywords: [
      'restaurant',
      'pos',
      'management', 
      'kitchen',
      'orders',
      'payments',
      'electron'
    ],
    author: {
      name: 'Restaurant Management Team',
      email: 'support@restaurant-manager.com'
    }
  }
};