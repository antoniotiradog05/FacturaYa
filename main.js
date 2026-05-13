const { app, BrowserWindow } = require('electron');
const path = require('path');
const expressApp = require('./server'); // Import Express app

let mainWindow;
let server;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "FacturaYa Pro",
    icon: path.join(__dirname, 'public/favicon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Start Express on a dynamic port
  server = expressApp.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    console.log(`Express server listening on port ${port}`);
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (server) {
    server.close();
  }
});
