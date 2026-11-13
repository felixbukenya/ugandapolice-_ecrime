// SafeReport UG settings. Edit here, or set environment variables.
// XAMPP defaults: MySQL on 127.0.0.1:3306, user "root", empty password.
module.exports = {
  port: process.env.PORT || 3000,
  db: {
    driver: (process.env.DB_DRIVER || 'mysql').toLowerCase(),   // 'mysql' (XAMPP) or 'sqlite' (no setup, needs Node 22+)
    host: process.env.DB_HOST || '127.0.0.1',
    port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',          // XAMPP root has no password by default
    name: process.env.DB_NAME || 'safereport_ug',
  },
};
