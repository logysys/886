-- ============================================================
-- Database Schema for 886.wiki
-- Run: mysql -u root -p 886 < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS `886` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `886`;

-- 1. Users Table (Stores authenticated creators and their owner tokens)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `owner_key` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. OTPs Table (Stores 4-digit verification codes)
CREATE TABLE IF NOT EXISTS `otps` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL,
  `otp` VARCHAR(10) NOT NULL,
  `expires_at` BIGINT NOT NULL,
  `verified` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_otps_email` (`email`),
  INDEX `idx_otps_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Walls Table (Stores walls, layout configs, and owner cards)
CREATE TABLE IF NOT EXISTS `walls` (
  `id` VARCHAR(64) PRIMARY KEY,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `user_email` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) DEFAULT 'My WiKi Wall',
  `wall_num` INT NOT NULL,
  `data` LONGTEXT NOT NULL,
  `owner_key` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_walls_slug` (`slug`),
  INDEX `idx_walls_user` (`user_email`),
  INDEX `idx_walls_num` (`wall_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Wall Cards Table (Stores Co-WiKi visitor cards and moderation status)
CREATE TABLE IF NOT EXISTS `wall_cards` (
  `id` VARCHAR(64) PRIMARY KEY,
  `wall_id` VARCHAR(64) NOT NULL,
  `raw` LONGTEXT NOT NULL,
  `zone` VARCHAR(10) DEFAULT 'b',
  `anchor` VARCHAR(64) DEFAULT '',
  `ok` TINYINT(1) DEFAULT 1,
  `author_hash` VARCHAR(64) DEFAULT NULL,
  `author_ip` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cards_wall` (`wall_id`),
  INDEX `idx_cards_ok` (`ok`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
