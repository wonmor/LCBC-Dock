// Preload script — runs in renderer context with Node.js access
// Currently minimal; can be extended for native features
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("dockit", {
  platform: process.platform,
  isDesktop: true,
});
