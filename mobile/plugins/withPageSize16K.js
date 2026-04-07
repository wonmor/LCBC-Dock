const { withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

module.exports = function withPageSize16K(config) {
  // Set gradle properties
  config = withGradleProperties(config, (config) => {
    const props = [
      { key: "android.experimental.art.16kb.alignment", value: "true" },
      { key: "kotlin.suppressKotlinVersionCompatibilityCheck", value: "true" },
    ];
    for (const prop of props) {
      config.modResults = config.modResults.filter(
        (item) => !(item.type === "property" && item.key === prop.key)
      );
      config.modResults.push({ type: "property", ...prop });
    }
    return config;
  });

  // Patch build.gradle to extract native libs uncompressed (required for 16KB)
  config = withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes("useLegacyPackaging")) {
      return config;
    }

    // Add packaging options and enable extractNativeLibs=false
    config.modResults.contents = contents.replace(
      /android\s*\{/,
      `android {
    packaging {
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
