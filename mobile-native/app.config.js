// Dynamic Expo config: keeps everything in app.json and injects the build date so the
// version footer's date is captured automatically at `eas build` time (instead of a
// hand-maintained constant that drifts). Expo loads app.json into `config`, then calls
// this — so `...config` preserves every static setting (eas projectId, plugins, etc.).
// IST date (UTC + 5:30) to match the rest of the app's IST convention.
const buildDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    buildDate,
  },
});
