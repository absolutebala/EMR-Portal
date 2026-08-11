const expoConfig = require('eslint-config-expo/flat');
const { defineConfig, globalIgnores } = require('eslint/config');

// This project has its own config specifically so ESLint's flat-config upward
// directory search doesn't fall back to the parent emr-portal repo's
// eslint.config.mjs (Next.js rules) — a separate npm project needs its own lint
// config, not to inherit one from a directory above it.
module.exports = defineConfig([
  expoConfig,
  globalIgnores(['dist/**']),
]);
