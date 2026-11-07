const path = require('node:path');
const { openDatabase } = require('./src/db');
const { createApp } = require('./src/app');

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 4310;
// In production only Caddy may reach the app, so all traffic goes through HTTPS.
const host = process.env.HOST || (production ? '127.0.0.1' : '0.0.0.0');

const db = openDatabase(
  process.env.DB_FILE || path.join(__dirname, 'data', 'safe-view.db'),
  process.env.FIRST_LOGIN_FILE || path.join(__dirname, '.first-login.txt'),
);

const server = createApp(db).listen(port, host, () => {
  console.log(`Safe View website:   http://localhost:${port}/`);
  console.log(`Safe View dashboard: http://localhost:${port}/admin/`);
});

// Finishes open requests and closes the database cleanly on restart.
function shutDown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);
