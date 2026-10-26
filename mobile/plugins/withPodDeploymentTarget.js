const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const TARGET = "15.1";
const MARKER = "# withPodDeploymentTarget";

// Newer Xcode refuses pod targets below iOS 15 (async-storage's resource
// bundle defaults to 9.0), so raise every pod target to the app's minimum.
// fmt 11.0's consteval format strings don't compile with Xcode 26's clang,
// and fmt hard-codes FMT_USE_CONSTEVAL, so switch it off in the pod's header.
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
            `    end\n` +
            `    fmt_base = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')\n` +
            `    if File.exist?(fmt_base)\n` +
            `      src = File.read(fmt_base)\n` +
            `      patched = src.gsub('#  define FMT_USE_CONSTEVAL 1', '#  define FMT_USE_CONSTEVAL 0')\n` +
            `      if patched != src\n` +
            `        File.chmod(0644, fmt_base)\n` +
            `        File.write(fmt_base, patched)\n` +
            `      end\n` +
            `    end\n`
        );
        fs.writeFileSync(podfile, src);
      }
      return config;
    },
  ]);
};
