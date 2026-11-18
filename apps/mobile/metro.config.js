// Metro config: let the app import the shared domain package from the monorepo.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot];
config.resolver.extraNodeModules = {
  '@open-workouts/shared': path.join(sharedRoot, 'src'),
};
// Resolve shared's dependencies (zod) from the app's node_modules.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
