const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const TARGET = "15.1";
const MARKER = "# withPodDeploymentTarget";

// Newer Xcode refuses pod targets below iOS 15 (async-storage's resource
// bundle defaults to 9.0), so raise every pod target to the app's minimum.
module.exports = function withPodDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let src = fs.readFileSync(podfile, "utf8");
      if (!src.includes(MARKER)) {
        src = src.replace(
          /post_install do \|installer\|\n/,
          (m) =>
            m +
            `    ${MARKER}\n` +
            `    installer.pods_project.targets.each do |t|\n` +
            `      t.build_configurations.each do |c|\n` +
            `        if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${TARGET}\n` +
            `          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${TARGET}'\n` +
            `        end\n` +
            `      end\n` +
            `    end\n`
        );
        fs.writeFileSync(podfile, src);
      }
      return config;
    },
  ]);
};
