const { withGradleProperties } = require("expo/config-plugins");

module.exports = function withKotlinVersion(config, version = "1.9.25") {
  return withGradleProperties(config, (config) => {
    // Set Kotlin version
    config.modResults = config.modResults.filter(
      (item) => !(item.type === "property" && (item.key === "kotlinVersion" || item.key === "kotlin.suppressKotlinVersionCompatibilityCheck"))
    );
    config.modResults.push(
      { type: "property", key: "kotlinVersion", value: version },
      { type: "property", key: "kotlin.suppressKotlinVersionCompatibilityCheck", value: "true" }
    );
    return config;
  });
};
