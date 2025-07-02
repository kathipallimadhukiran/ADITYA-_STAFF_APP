// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add resolver configuration for Realm
config.resolver = {
  ...config.resolver,
  sourceExts: [...(config.resolver.sourceExts || []), 'cjs', 'mjs'],
  assetExts: [...(config.resolver.assetExts || []), 'realm', 'node'],
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    stream: require.resolve('stream-browserify'),
    path: require.resolve('path-browserify'),
  },
};

// Add additional configurations for better build performance
config.maxWorkers = 4;
config.transformer = {
  ...config.transformer,
  minifierPath: 'metro-minify-terser',
  minifierConfig: {
    ...config.transformer.minifierConfig,
    keep_classnames: true,
    keep_fnames: true,
  },
};

module.exports = config;
