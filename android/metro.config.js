const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const projectRoot = __dirname;
const zekeSyncPath = path.resolve(projectRoot, 'zeke-sync').replace(/\\/g, '/');
const serverPath = path.resolve(projectRoot, 'server').replace(/\\/g, '/');
const scriptsPath = path.resolve(projectRoot, 'scripts').replace(/\\/g, '/');
const attachedAssetsPath = path.resolve(projectRoot, 'attached_assets').replace(/\\/g, '/');

config.resolver = {
  ...config.resolver,
  blockList: [
    new RegExp(`^${zekeSyncPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`),
    new RegExp(`^${serverPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`),
    new RegExp(`^${scriptsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`),
    new RegExp(`^${attachedAssetsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`),
    /\.cache\/.*/,
    /static-build\/.*/,
  ],
};

config.transformer = {
  ...config.transformer,
  minifierConfig: {
    compress: {
      drop_console: process.env.NODE_ENV === 'production',
      drop_debugger: true,
    },
    mangle: true,
    output: {
      comments: false,
    },
  },
};

config.maxWorkers = 4;

module.exports = config;
