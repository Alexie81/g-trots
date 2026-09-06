const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// This repository also contains the desktop app, PHP API and tens of
// thousands of generated website pages. None of them are React Native module
// inputs, so keeping them out of Metro's file map makes local Expo startup
// predictable without affecting the mobile bundle.
config.resolver.blockList = [
  /[\\/]website[\\/].*/,
  /[\\/]website_public_g-trots\.ro[\\/].*/,
  /[\\/]website_downloads[\\/].*/,
  /[\\/]electron-app[\\/].*/,
  /[\\/]desktop-update-server[\\/].*/,
  /[\\/]shop-api[\\/].*/,
  /[\\/]backups[\\/].*/,
  /[\\/]outputs?[\\/].*/,
  /[\\/]tmp[\\/].*/,
  /[\\/]\.codex-tmp[\\/].*/,
];

module.exports = config;
