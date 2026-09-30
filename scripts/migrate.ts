import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function runMigration() {
  console.log('====================================================');
  console.log(' 886.wiki Database Migration Tool');
  console.log('====================================================');

  const host = process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);
  const user = process.env.DB_USERNAME || process.env.DB_USER || process.env.MYSQL_USER || 'root';
  const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQL_PASSWORD || '');
  const database = process.env.DB_DATABASE || process.env.MYSQL_DATABASE || '886';

  console.log(`[Config] Host:     ${host}:${port}`);
  console.log(`[Config] User:     ${user}`);
  console.log(`[Config] Database: ${database}`);
  console.log('----------------------------------------------------');

  let connection: mysql.Connection | null = null;

  try {
    // 1. Connect without selecting database to ensure database exists
    console.log(`[1/5] Connecting to MySQL server at ${host}:${port}...`);
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
    });
    console.log('      ✓ Connected to MySQL server.');

    // 2. Create Database if not exists
    console.log(`[2/5] Ensuring database \`${database}\` exists...`);
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await connection.query(`USE \`${database}\`;`);
    console.log(`      ✓ Database \`${database}\` is ready.`);

    // 3. Create Tables
    console.log('[3/5] Migrating schema tables...');

    // Users
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        owner_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('      ✓ Table `users` created/verified.');

    // OTPs
    await connection.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        verified TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_otps_email (email),
        INDEX idx_otps_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('      ✓ Table `otps` created/verified.');

    // Walls
    await connection.query(`
      CREATE TABLE IF NOT EXISTS walls (
        id VARCHAR(64) PRIMARY KEY,
        slug VARCHAR(255) NOT NULL UNIQUE,
        user_email VARCHAR(255) NOT NULL,
        title VARCHAR(255) DEFAULT 'My WiKi Wall',
        wall_num INT NOT NULL,
        data LONGTEXT NOT NULL,
        owner_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_walls_slug (slug),
        INDEX idx_walls_user (user_email),
        INDEX idx_walls_num (wall_num)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('      ✓ Table `walls` created/verified.');

    // Wall Cards
    await connection.query(`
      CREATE TABLE IF NOT EXISTS wall_cards (
        id VARCHAR(64) PRIMARY KEY,
        wall_id VARCHAR(64) NOT NULL,
        raw LONGTEXT NOT NULL,
        zone VARCHAR(10) DEFAULT 'b',
        anchor VARCHAR(64) DEFAULT '',
        ok TINYINT(1) DEFAULT 1,
        author_hash VARCHAR(64) DEFAULT NULL,
        author_ip VARCHAR(64) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cards_wall (wall_id),
        INDEX idx_cards_ok (ok)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('      ✓ Table `wall_cards` created/verified.');

    // 4. Clean state verification (ensure no legacy W0003517)
    console.log('[4/5] Verifying clean state (purging legacy W0003517 if present)...');
    try {
      await connection.query('DELETE FROM walls WHERE id = ?', ['W0003517']);
      console.log('      ✓ Legacy W0003517 cleaned.');
    } catch (e) {}

    // 5. Check if local data/mysql_db.json has extra walls/users to import
    console.log('[5/5] Checking for local JSON database records to import...');
    const jsonPath = path.resolve(process.cwd(), 'data', 'mysql_db.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const localData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        let importedWalls = 0;
        let importedUsers = 0;

        // Import users
        if (Array.isArray(localData.users)) {
          for (const u of localData.users) {
            try {
              await connection.query(
                `INSERT IGNORE INTO users (email, owner_key) VALUES (?, ?)`,
                [u.email, u.owner_key]
              );
              importedUsers++;
            } catch (e) {}
          }
        }

        // Import walls
        if (Array.isArray(localData.walls)) {
          for (const w of localData.walls) {
            try {
              await connection.query(
                `INSERT IGNORE INTO walls (id, slug, user_email, title, wall_num, data, owner_key)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [w.id, w.slug, w.user_email, w.title, w.wall_num, w.data, w.owner_key]
              );
              importedWalls++;
            } catch (e) {}
          }
        }

        console.log(`      ✓ Local sync completed (${importedUsers} users, ${importedWalls} walls verified).`);
      } catch (e: any) {
        console.warn('      ! Note: Local JSON data was not imported:', e.message);
      }
    } else {
      console.log('      ✓ No local JSON file to import.');
    }

    console.log('----------------------------------------------------');
    console.log('🎉 Migration finished successfully! Database is ready.');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n❌ Migration Failed:');
    console.error(err.message);
    console.error('\nPlease verify your DB_* credentials in .env and make sure MySQL service is running:');
    console.error('  sudo systemctl status mysql\n');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
