-- =====================================================================
-- SafeReport UG : database schema for MySQL / MariaDB (XAMPP + phpMyAdmin)
--
-- HOW TO IMPORT (phpMyAdmin):
--   1. Start MySQL in the XAMPP Control Panel.
--   2. Open http://localhost/phpmyadmin  and click the HOME icon (top-left),
--      NOT a database. (If you are inside a database, importing still works,
--      because this file creates and selects its own database below.)
--   3. Click Import > Choose file > schema.sql > Go.
--   4. A database called safereport_ug with 9 tables appears on the left.
--
-- The Node server (node server.js) also creates all of this automatically
-- if it is missing, so importing by hand is optional.
-- To start again from zero, run:  DROP DATABASE safereport_ug
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `safereport_ug` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `safereport_ug`;

-- Police users: officers, station commanders, administrators
CREATE TABLE IF NOT EXISTS `users` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`         VARCHAR(40)  NOT NULL,
  `full_name`        VARCHAR(80)  NOT NULL,
  `role`             ENUM('officer','commander','admin') NOT NULL,
  `station`          VARCHAR(80)  NULL,
  `password_hash`    VARCHAR(200) NOT NULL,
  `nin`              VARCHAR(14)  NULL,
  `face_descriptor`  TEXT         NULL,
  `id_descriptor`    TEXT         NULL,
  `id_photo`         VARCHAR(64)  NULL,
  `face_photo`       VARCHAR(64)  NULL,
  `face_enrolled_at` DATETIME     NULL,
  `unlock_at`        DATETIME     NULL,
  `active`           TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_nin` (`nin`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login sessions for police users
CREATE TABLE IF NOT EXISTS `sessions` (
  `token`      CHAR(64) NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`token`),
  KEY `idx_sessions_user` (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crime reports submitted by citizens
CREATE TABLE IF NOT EXISTS `reports` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ref`            VARCHAR(12)  NOT NULL,
  `pin_hash`       VARCHAR(200) NOT NULL,
  `category`       VARCHAR(40)  NOT NULL,
  `description`    TEXT         NOT NULL,
  `district`       VARCHAR(40)  NOT NULL,
  `place`          VARCHAR(120) NULL,
  `lat`            DOUBLE       NULL,
  `lng`            DOUBLE       NULL,
  `occurred_at`    DATETIME     NOT NULL,
  `anonymous`      TINYINT(1)   NOT NULL DEFAULT 1,
  `reporter_name`  VARCHAR(80)  NULL,
  `reporter_phone` VARCHAR(20)  NULL,
  `priority`       ENUM('normal','high','urgent') NOT NULL DEFAULT 'normal',
  `status`         ENUM('Received','Under review','Assigned to officer','Resolved','Rejected') NOT NULL DEFAULT 'Received',
  `assigned_to`    INT UNSIGNED NULL,
  `duplicate_of`   VARCHAR(12)  NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reports_ref` (`ref`),
  KEY `idx_reports_status` (`status`),
  KEY `idx_reports_district` (`district`),
  KEY `idx_reports_created` (`created_at`),
  KEY `idx_reports_assigned` (`assigned_to`),
  CONSTRAINT `fk_reports_assigned` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Photo / video evidence attached to a report
CREATE TABLE IF NOT EXISTS `evidence` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id`  INT UNSIGNED NOT NULL,
  `filename`   VARCHAR(64) NOT NULL,
  `mime`       VARCHAR(40) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_evidence_report` (`report_id`),
  CONSTRAINT `fk_evidence_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Two-way messages between officer and (anonymous) citizen
CREATE TABLE IF NOT EXISTS `messages` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id`  INT UNSIGNED NOT NULL,
  `sender`     ENUM('citizen','police') NOT NULL,
  `body`       TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_messages_report` (`report_id`),
  CONSTRAINT `fk_messages_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Internal officer notes (never shown to citizen)
CREATE TABLE IF NOT EXISTS `notes` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id`  INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `body`       TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notes_report` (`report_id`),
  KEY `idx_notes_user` (`user_id`),
  CONSTRAINT `fk_notes_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Status history shown as the citizen's tracking timeline
CREATE TABLE IF NOT EXISTS `status_history` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id`  INT UNSIGNED NOT NULL,
  `status`     VARCHAR(30) NOT NULL,
  `user_id`    INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_report` (`report_id`),
  KEY `idx_history_user` (`user_id`),
  CONSTRAINT `fk_history_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit log of every police action (accountability)
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NULL,
  `action`     VARCHAR(60) NOT NULL,
  `detail`     TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every login attempt (success or failure): who, when, where, how well the face matched
CREATE TABLE IF NOT EXISTS `login_events` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NULL,
  `nin`        VARCHAR(20)  NULL,
  `success`    TINYINT(1)   NOT NULL,
  `reason`     VARCHAR(30)  NULL,
  `kind`       VARCHAR(10)  NULL,
  `lat`        DOUBLE       NULL,
  `lng`        DOUBLE       NULL,
  `accuracy_m` DOUBLE       NULL,
  `outside_ug` TINYINT(1)   NOT NULL DEFAULT 0,
  `dist_live`  DOUBLE       NULL,
  `dist_id`    DOUBLE       NULL,
  `dist_cross` DOUBLE       NULL,
  `liveness`   TINYINT(1)   NOT NULL DEFAULT 0,
  `photo`      VARCHAR(64)  NULL,
  `ip`         VARCHAR(64)  NULL,
  `user_agent` VARCHAR(200) NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_login_user` (`user_id`, `created_at`),
  CONSTRAINT `fk_login_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
