const { withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

// Enables 16KB page size support required by Google Play for API 35+
module.exports = function withPageSize16K(config) {
  // Add gradle property
  config = withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) =>
        !(item.type === "property" && item.key === "android.experimental.art.16kb.alignment")
    );
    config.modResults.push({
      type: "property",
      key: "android.experimental.art.16kb.alignment",
      value: "true",
    });
    return config;
  });

  // Patch app/build.gradle to align native libs to 16KB
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes("page_size")) {
      return config;
    }

    // Add packaging options to align shared libs to 16KB pages
    const anchor = "android {";
    config.modResults.contents = config.modResults.contents.replace(
      anchor,
      `${anchor}
    packagingOptions {
        jniLibs {
            useLegacyPackaging = false
        }
    }
`
    );

    return config;
  });

  return config;
};
