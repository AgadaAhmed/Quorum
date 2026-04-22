const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Fix react-async-hook ESM resolution issue on web for react-native-country-picker-modal
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
