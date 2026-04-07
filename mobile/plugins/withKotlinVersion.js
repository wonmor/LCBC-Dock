const { withGradleProperties } = require("expo/config-plugins");

module.exports = function withKotlinVersion(config, version = "1.9.25") {
  return withGradleProperties(config, (config) => {
    // Remove existing kotlin version if present
    config.modResults = config.modResults.filter(
      (item) => !(item.type === "property" && item.key === "kotlinVersion")
    );
    // Add the correct version
    config.modResults.push({
      type: "property",
      key: "kotlinVersion",
      value: version,
    });
    return config;
  });
};
