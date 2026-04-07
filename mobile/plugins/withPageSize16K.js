const { withGradleProperties } = require("expo/config-plugins");

// Enables 16KB page size support required by Google Play for API 35+
// See: https://developer.android.com/guide/practices/page-sizes
module.exports = function withPageSize16K(config) {
  return withGradleProperties(config, (config) => {
    // Remove existing entries if present
    config.modResults = config.modResults.filter(
      (item) =>
        !(
          item.type === "property" &&
          (item.key === "android.experimental.art.16kb.alignment" ||
            item.key === "android.experimental.enablePageSizeConfig")
        )
    );

    config.modResults.push(
      {
        type: "property",
        key: "android.experimental.art.16kb.alignment",
        value: "true",
      }
    );

    return config;
  });
};
