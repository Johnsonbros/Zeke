const baseConfig = require('./app.json');

module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  const expoConfig = {
    ...baseConfig.expo,
  };

  if (googleMapsApiKey && googleMapsApiKey !== '') {
    expoConfig.android = {
      ...expoConfig.android,
      config: {
        ...expoConfig.android?.config,
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    };
  }

  return {
    expo: expoConfig,
  };
};
