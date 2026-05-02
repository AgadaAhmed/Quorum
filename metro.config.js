const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Ensure node_modules assets (e.g. react-native-country-picker-modal images) are served
config.watchFolders = [projectRoot];

// Fix react-async-hook ESM resolution issue for react-native-country-picker-modal
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-async-hook') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/react-async-hook/dist/index.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
