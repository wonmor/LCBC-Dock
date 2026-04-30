const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const WEB_URL = "https://lcbc-client.apps.johnseong.com";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(WEB_URL);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(WEB_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Menu
const template = [
  {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "front" },
    ],
  },
  {
    label: "Go",
    submenu: [
      {
        label: "Home",
        accelerator: "CmdOrCtrl+Shift+H",
        click: () => mainWindow?.loadURL(WEB_URL),
      },
      {
        label: "Examples",
        accelerator: "CmdOrCtrl+Shift+E",
        click: () => mainWindow?.loadURL(`${WEB_URL}/examples`),
      },
      {
        label: "Dashboard",
        accelerator: "CmdOrCtrl+Shift+D",
        click: () => mainWindow?.loadURL(`${WEB_URL}/dashboard`),
      },
      {
        label: "New Docking",
        accelerator: "CmdOrCtrl+N",
        click: () => mainWindow?.loadURL(`${WEB_URL}/docking/protein`),
      },
      {
        label: "Glossary",
        accelerator: "CmdOrCtrl+Shift+G",
        click: () => mainWindow?.loadURL(`${WEB_URL}/glossary`),
      },
      { type: "separator" },
      {
        label: "Compare runs",
        click: () => mainWindow?.loadURL(`${WEB_URL}/compare`),
      },
    ],
  },
];

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
