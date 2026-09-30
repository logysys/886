import dotenv from 'dotenv';
dotenv.config();

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface DbUser {
  id: number;
  email: string;
  owner_key: string;
  created_at: string;
}

export interface DbOtp {
  id: number;
  email: string;
  otp: string;
  expires_at: number;
  verified: number;
  created_at: string;
}

export interface DbWall {
  id: string;
  slug: string;
  user_email: string;
  title: string;
  wall_num: number;
  data: string;
  owner_key: string;
  created_at: string;
  updated_at: string;
}

export interface DbWallCard {
  id: string;
  wall_id: string;
  raw: string;
  zone: string;
  anchor: string;
  ok: number;
  author_hash?: string;
  author_ip?: string;
  created_at: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const JSON_DB_FILE = path.join(DATA_DIR, 'mysql_db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface LocalSchema {
  users: DbUser[];
  otps: DbOtp[];
  walls: DbWall[];
  wall_cards: DbWallCard[];
}

function loadLocalDb(): LocalSchema {
  if (fs.existsSync(JSON_DB_FILE)) {
    try {
      const raw = fs.readFileSync(JSON_DB_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error loading JSON DB, reinitializing:', e);
    }
  }
  const initial: LocalSchema = {
    users: [],
    otps: [],
    walls: [],
    wall_cards: []
  };
  saveLocalDb(initial);
  return initial;
}

function saveLocalDb(db: LocalSchema) {
  fs.writeFileSync(JSON_DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

class DatabaseManager {
  private pool: mysql.Pool | null = null;
  private isMySqlConnected = false;
  private lastError: string | null = null;
  private localDb: LocalSchema = loadLocalDb();

  constructor() {
    this.initDatabase();
  }

  private async initDatabase() {
    const host = process.env.DB_HOST || process.env.MYSQL_HOST;
    const user = process.env.DB_USERNAME || process.env.DB_USER || process.env.MYSQL_USER;
    const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : process.env.MYSQL_PASSWORD;
    const database = process.env.DB_DATABASE || process.env.MYSQL_DATABASE || '886';
    const port = parseInt(process.env.DB_PORT || process.env.MYSQL_PORT || '3306', 10);

    if (host && user) {
      try {
        console.log(`[MySQL] Connecting to ${user}@${host}:${port}...`);
        
        // 1. Ensure database exists
        try {
          const preConn = await mysql.createConnection({
            host,
            user,
            password,
            port,
            connectTimeout: 5000,
          });
          await preConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
          await preConn.end();
        } catch (dbErr: any) {
          console.warn(`[MySQL] Note during DB creation check: ${dbErr.message}`);
        }

        // 2. Create connection pool for the database
        this.pool = mysql.createPool({
          host,
          user,
          password,
          database,
          port,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          connectTimeout: 5000,
        });

        // Test connection
        const conn = await this.pool.getConnection();
        console.log(`[MySQL] Connection to \`${database}\` established successfully.`);
        this.isMySqlConnected = true;
        this.lastError = null;

        await this.createTables(conn);
        await this.syncLocalDbToMySql(conn);
        conn.release();
      } catch (err: any) {
        this.lastError = err.message;
        console.warn(`[MySQL] Could not connect to remote MySQL server (${err.message}). Using persistent relational storage in data/mysql_db.json.`);
        this.isMySqlConnected = false;
        this.pool = null;
      }
    } else {
      console.log('[MySQL] No DB_HOST or MYSQL_HOST configured. Running in persistent relational DB mode (data/mysql_db.json).');
      this.isMySqlConnected = false;
    }
  }

  // Sync existing local records into MySQL
  async syncLocalDbToMySql(connectionOrPool?: any): Promise<{ users: number; walls: number; cards: number }> {
    const runner = connectionOrPool || this.pool;
    let syncedUsers = 0;
    let syncedWalls = 0;
    let syncedCards = 0;

    if (!runner) return { users: 0, walls: 0, cards: 0 };

    try {
      // Sync Users
      if (this.localDb.users && this.localDb.users.length > 0) {
        for (const u of this.localDb.users) {
          try {
            await runner.query(
              'INSERT IGNORE INTO users (email, owner_key) VALUES (?, ?)',
              [u.email, u.owner_key]
            );
            syncedUsers++;
          } catch (e) {}
        }
      }

      // Sync Walls (including W0000001, W0000002, etc.)
      if (this.localDb.walls && this.localDb.walls.length > 0) {
        for (const w of this.localDb.walls) {
          try {
            await runner.query(
              `INSERT INTO walls (id, slug, user_email, title, wall_num, data, owner_key)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE 
                 title = VALUES(title),
                 data = VALUES(data),
                 updated_at = NOW()`,
              [w.id, w.slug, w.user_email, w.title, w.wall_num, w.data, w.owner_key]
            );
            syncedWalls++;
          } catch (e) {}
        }
        console.log(`[MySQL] Synced ${syncedWalls} walls from local store into MySQL database.`);
      }

      // Sync Wall Cards
      if (this.localDb.wall_cards && this.localDb.wall_cards.length > 0) {
        for (const c of this.localDb.wall_cards) {
          try {
            await runner.query(
              `INSERT IGNORE INTO wall_cards (id, wall_id, raw, zone, anchor, ok, author_hash, author_ip)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [c.id, c.wall_id, c.raw, c.zone, c.anchor, c.ok, c.author_hash, c.author_ip]
            );
            syncedCards++;
          } catch (e) {}
        }
      }
    } catch (e: any) {
      console.warn('[MySQL Sync] Note during sync to MySQL:', e.message);
    }

    return { users: syncedUsers, walls: syncedWalls, cards: syncedCards };
  }

  private async createTables(conn: mysql.PoolConnection) {
    const createUsers = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        owner_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    const createOtps = `
      CREATE TABLE IF NOT EXISTS otps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        verified TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    const createWalls = `
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
        INDEX idx_slug (slug),
        INDEX idx_user (user_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    const createCards = `
      CREATE TABLE IF NOT EXISTS wall_cards (
        id VARCHAR(64) PRIMARY KEY,
        wall_id VARCHAR(64) NOT NULL,
        raw LONGTEXT NOT NULL,
        zone VARCHAR(10) DEFAULT 'b',
        anchor VARCHAR(64) DEFAULT '',
        ok TINYINT(1) DEFAULT 1,
        author_hash VARCHAR(64),
        author_ip VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wall (wall_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    await conn.query(createUsers);
    try {
      await conn.query('ALTER TABLE users ADD COLUMN owner_key VARCHAR(255) AFTER email');
    } catch (e) {}

    await conn.query(createOtps);
    await conn.query(createWalls);
    await conn.query(createCards);
    console.log('[MySQL] Schema verification completed.');
  }

  // Find user by email
  async findUserByEmail(email: string): Promise<DbUser | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.isMySqlConnected && this.pool) {
      try {
        const [rows]: any = await this.pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
        return rows[0] || null;
      } catch (e) {
        console.error('[MySQL Error] findUserByEmail:', e);
      }
    }
    const user = this.localDb.users.find(u => u.email.toLowerCase() === cleanEmail);
    return user || null;
  }

  // Find user by owner_key / token
  async findUserByOwnerKey(ownerKey: string): Promise<DbUser | null> {
    const cleanKey = ownerKey.trim();
    if (!cleanKey) return null;
    if (this.isMySqlConnected && this.pool) {
      try {
        const [rows]: any = await this.pool.query('SELECT * FROM users WHERE owner_key = ? LIMIT 1', [cleanKey]);
        return rows[0] || null;
      } catch (e) {
        console.error('[MySQL Error] findUserByOwnerKey:', e);
      }
    }
    const user = this.localDb.users.find(u => u.owner_key === cleanKey);
    return user || null;
  }

  // Create or get user:
  // - If user exists in user db: just login, no need to store in db.
  // - If user does not exist in user db: store email address and owner key or token in user table.
  async getOrCreateUser(email: string, customOwnerKey?: string): Promise<DbUser> {
    const cleanEmail = email.trim().toLowerCase();
    const existing = await this.findUserByEmail(cleanEmail);
    
    // Existing user: just login, DO NOT re-insert into DB
    if (existing) {
      if (!existing.owner_key) {
        const key = customOwnerKey || `wiki-owner-${crypto.randomBytes(8).toString('hex')}`;
        existing.owner_key = key;
        if (this.isMySqlConnected && this.pool) {
          try {
            await this.pool.query('UPDATE users SET owner_key = ? WHERE id = ?', [key, existing.id]);
          } catch (e) {}
        }
        saveLocalDb(this.localDb);
      }
      return existing;
    }

    // New user: generate owner key / token and store in user table
    const ownerKey = customOwnerKey || `wiki-owner-${crypto.randomBytes(8).toString('hex')}`;
    if (this.isMySqlConnected && this.pool) {
      try {
        const [res]: any = await this.pool.query(
          'INSERT INTO users (email, owner_key) VALUES (?, ?)',
          [cleanEmail, ownerKey]
        );
        return {
          id: res.insertId,
          email: cleanEmail,
          owner_key: ownerKey,
          created_at: new Date().toISOString()
        };
      } catch (e) {
        console.error('[MySQL Error] getOrCreateUser:', e);
      }
    }

    const newUser: DbUser = {
      id: this.localDb.users.length + 1,
      email: cleanEmail,
      owner_key: ownerKey,
      created_at: new Date().toISOString()
    };
    this.localDb.users.push(newUser);
    saveLocalDb(this.localDb);
    return newUser;
  }

  // Create OTP record
  async createOtp(email: string, otp: string, expiresAt: number): Promise<DbOtp> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.isMySqlConnected && this.pool) {
      try {
        const [res]: any = await this.pool.query(
          'INSERT INTO otps (email, otp, expires_at, verified) VALUES (?, ?, ?, 0)',
          [cleanEmail, otp, expiresAt]
        );
        return {
          id: res.insertId,
          email: cleanEmail,
          otp,
          expires_at: expiresAt,
          verified: 0,
          created_at: new Date().toISOString()
        };
      } catch (e) {
        console.error('[MySQL Error] createOtp:', e);
      }
    }

    const newOtp: DbOtp = {
      id: this.localDb.otps.length + 1,
      email: cleanEmail,
      otp,
      expires_at: expiresAt,
      verified: 0,
      created_at: new Date().toISOString()
    };
    this.localDb.otps.push(newOtp);
    saveLocalDb(this.localDb);
    return newOtp;
  }

  // Verify OTP
  async verifyOtp(email: string, inputOtp: string): Promise<{ valid: boolean; reason?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = inputOtp.trim();
    const now = Date.now();

    if (this.isMySqlConnected && this.pool) {
      try {
        const [rows]: any = await this.pool.query(
          'SELECT * FROM otps WHERE email = ? AND verified = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1',
          [cleanEmail, now]
        );
        if (!rows.length) {
          return { valid: false, reason: 'No active OTP found or code expired. Please request a new code.' };
        }
        const record = rows[0];
        if (record.otp !== cleanOtp) {
          return { valid: false, reason: 'Incorrect 4-digit verification code.' };
        }
        await this.pool.query('UPDATE otps SET verified = 1 WHERE id = ?', [record.id]);
        return { valid: true };
      } catch (e) {
        console.error('[MySQL Error] verifyOtp:', e);
      }
    }

    // Local DB fallback
    const matching = this.localDb.otps
      .filter(o => o.email.toLowerCase() === cleanEmail && !o.verified && o.expires_at > now)
      .sort((a, b) => b.id - a.id);

    if (!matching.length) {
      return { valid: false, reason: 'No active OTP found or code expired. Please request a new code.' };
    }

    const latest = matching[0];
    if (latest.otp !== cleanOtp) {
      return { valid: false, reason: 'Incorrect 4-digit verification code.' };
    }

    latest.verified = 1;
    saveLocalDb(this.localDb);
    return { valid: true };
  }

  // Get next sequential wall number
  async getNextWallNumber(): Promise<number> {
    if (this.isMySqlConnected && this.pool) {
      try {
        const [rows]: any = await this.pool.query('SELECT MAX(wall_num) as maxNum FROM walls');
        const maxNum = rows[0]?.maxNum || 0;
        return maxNum + 1;
      } catch (e) {
        console.error('[MySQL Error] getNextWallNumber:', e);
      }
    }

    let maxNum = 0;
    for (const w of this.localDb.walls) {
      if (w.wall_num && w.wall_num > maxNum) {
        maxNum = w.wall_num;
      }
    }
    return maxNum + 1;
  }

  // Format ID and Slug: W0000001, 886.wiki/W0000001
  formatWallSlug(num: number): { id: string; slug: string } {
    const padded = String(num).padStart(7, '0');
    const id = `W${padded}`;
    const slug = `886.wiki/${id}`;
    return { id, slug };
  }

  // Create Wall
  async createWall(params: {
    id: string;
    slug: string;
    userEmail: string;
    title: string;
    wallNum: number;
    data: any;
    ownerKey: string;
  }): Promise<DbWall> {
    const dataStr = typeof params.data === 'string' ? params.data : JSON.stringify(params.data);
    const now = new Date().toISOString();

    const newWall: DbWall = {
      id: params.id,
      slug: params.slug,
      user_email: params.userEmail,
      title: params.title,
      wall_num: params.wallNum,
      data: dataStr,
      owner_key: params.ownerKey,
      created_at: now,
      updated_at: now
    };

    // Always update local memory cache and file
    const existingIdx = this.localDb.walls.findIndex(w => w.id === params.id);
    if (existingIdx >= 0) {
      this.localDb.walls[existingIdx] = newWall;
    } else {
      this.localDb.walls.unshift(newWall);
    }
    saveLocalDb(this.localDb);

    // Save to MySQL
    if (this.isMySqlConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO walls (id, slug, user_email, title, wall_num, data, owner_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE 
             slug = VALUES(slug),
             user_email = VALUES(user_email),
             title = VALUES(title),
             wall_num = VALUES(wall_num),
             data = VALUES(data),
             owner_key = VALUES(owner_key),
             updated_at = NOW()`,
          [params.id, params.slug, params.userEmail, params.title, params.wallNum, dataStr, params.ownerKey]
        );
      } catch (e: any) {
        console.error('[MySQL Error] createWall:', e.message);
      }
    }

    return newWall;
  }

  // Get Wall by ID or Slug
  async getWall(idOrSlug: string): Promise<DbWall | null> {
    const clean = idOrSlug.trim();
    // Normalize variants like "886.wiki/W0000001", "886.WIKI/W0000001", "886. wiki/W0000001", "W0000001"
    const normalizedSlug = clean.replace(/\s+/g, '').toLowerCase();
    const extractIdMatch = clean.match(/(W\d+)/i);
    const extractedId = extractIdMatch ? extractIdMatch[1].toUpperCase() : clean.toUpperCase();

    if (this.isMySqlConnected && this.pool) {
      try {
        const [rows]: any = await this.pool.query(
          `SELECT * FROM walls WHERE id = ? OR LOWER(REPLACE(slug, ' ', '')) = ? OR id = ? LIMIT 1`,
          [clean, normalizedSlug, extractedId]
        );
        if (rows.length) return rows[0];
      } catch (e) {
        console.error('[MySQL Error] getWall:', e);
      }
    }

    const found = this.localDb.walls.find(
      w => w.id.toUpperCase() === clean.toUpperCase() ||
           w.id.toUpperCase() === extractedId ||
           w.slug.toLowerCase().replace(/\s+/g, '') === normalizedSlug
    );
    return found || null;
  }

  // Update Wall Data
  async updateWall(id: string, data: any): Promise<boolean> {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const now = new Date().toISOString();

    if (this.isMySqlConnected && this.pool) {
      try {
        await this.pool.query(
          'UPDATE walls SET data = ?, updated_at = NOW() WHERE id = ?',
          [dataStr, id]
        );
        return true;
      } catch (e) {
        console.error('[MySQL Error] updateWall:', e);
      }
    }

    const idx = this.localDb.walls.findIndex(w => w.id.toUpperCase() === id.toUpperCase());
    if (idx !== -1) {
      this.localDb.walls[idx].data = dataStr;
      this.localDb.walls[idx].updated_at = now;
      saveLocalDb(this.localDb);
      return true;
    }
    return false;
  }

  // List all walls
  async listWalls(): Promise<Array<{ id: string; slug: string; title: string; user_email: string; owner_key: string; created_at: string }>> {
    if (this.isMySqlConnected && this.pool) {
      try {
        const [rows]: any = await this.pool.query(
          'SELECT id, slug, title, user_email, owner_key, created_at FROM walls ORDER BY wall_num DESC'
        );
        return rows;
      } catch (e) {
        console.error('[MySQL Error] listWalls:', e);
      }
    }
    return this.localDb.walls.map(w => ({
      id: w.id,
      slug: w.slug,
      title: w.title,
      user_email: w.user_email,
      owner_key: w.owner_key,
      created_at: w.created_at
    }));
  }

  // Get DB Telemetry / Status
  getStats() {
    const host = process.env.DB_HOST || process.env.MYSQL_HOST || 'local-file';
    const database = process.env.DB_DATABASE || process.env.MYSQL_DATABASE || '886';
    return {
      type: this.isMySqlConnected ? 'MySQL Server (Production)' : 'MySQL DB (Local Storage Fallback)',
      connected: this.isMySqlConnected,
      host,
      database,
      lastError: this.lastError,
      tables: {
        users: this.localDb.users.length,
        otps: this.localDb.otps.length,
        walls: this.localDb.walls.length,
        wall_cards: this.localDb.wall_cards.length
      }
    };
  }
}

export const dbManager = new DatabaseManager();
