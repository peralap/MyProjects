require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

async function copyLegacyData(connection, database, legacyDatabase) {
  const [legacySchemas] = await connection.execute(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    [legacyDatabase],
  );
  if (!legacySchemas.length) return;

  const [[targetUsers]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${database}\`.users`);
  const [[targetPayments]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${database}\`.payments`);
  if (targetUsers.total > 0 || targetPayments.total > 0) return;

  const [legacyTables] = await connection.execute(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
    [legacyDatabase],
  );
  const available = new Set(legacyTables.map((table) => table.TABLE_NAME));
  if (!available.has('users')) return;

  await connection.beginTransaction();
  try {
    const tableOrder = ['users', 'subscription_plans', 'profiles', 'connections', 'payments', 'subscriptions'];
    if (available.has('subscription_plans')) await connection.query(`DELETE FROM \`${database}\`.subscription_plans`);
    for (const table of tableOrder) {
      if (!available.has(table)) continue;
      const [sourceColumns] = await connection.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [legacyDatabase, table],
      );
      const [targetColumns] = await connection.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [database, table],
      );
      const sourceNames = new Set(sourceColumns.map((column) => column.COLUMN_NAME));
      const columns = targetColumns.map((column) => column.COLUMN_NAME).filter((name) => sourceNames.has(name));
      if (!columns.length) continue;
      const names = columns.map((name) => `\`${name}\``).join(', ');
      await connection.query(
        `INSERT INTO \`${database}\`.\`${table}\` (${names}) SELECT ${names} FROM \`${legacyDatabase}\`.\`${table}\``,
      );
    }
    await connection.commit();
    console.log(`Copied existing data from ${legacyDatabase}; the source database was left unchanged.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function migrate() {
  const database = process.env.DB_NAME || 'maitri_matrimony';
  const legacyDatabase = 'telangana_matrimony';
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('DB_NAME may contain only letters, numbers, and underscores.');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    const schema = await fs.readFile(path.join(__dirname, '../database/schema.sql'), 'utf8');
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await connection.query(`USE \`${database}\`; ${schema}`);
    const [roleColumn] = await connection.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'",
      [database],
    );
    if (!roleColumn.length) {
      await connection.query(`ALTER TABLE \`${database}\`.users ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user' AFTER account_status`);
    }
    if (process.env.ADMIN_EMAIL) {
      const [result] = await connection.execute(
        "UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER(?)",
        [process.env.ADMIN_EMAIL.trim()],
      );
      if (!result.affectedRows) console.warn('ADMIN_EMAIL does not match an existing account; create it, then rerun the migration.');
    }
    if (database !== legacyDatabase) await copyLegacyData(connection, database, legacyDatabase);
    console.log(`Database schema is ready: ${database}`);
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
