CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  account_status ENUM('Pending', 'Active', 'Suspended') NOT NULL DEFAULT 'Pending',
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  date_of_birth DATE NOT NULL,
  height_cm SMALLINT UNSIGNED NULL,
  religion VARCHAR(60) NOT NULL DEFAULT 'Hindu',
  caste_community VARCHAR(120) NULL,
  gothram VARCHAR(120) NULL,
  rasi VARCHAR(60) NULL,
  star_nakshatram VARCHAR(60) NULL,
  mother_tongue VARCHAR(60) NOT NULL DEFAULT 'Telugu',
  native_district VARCHAR(80) NOT NULL,
  current_city VARCHAR(120) NOT NULL,
  education VARCHAR(160) NULL,
  profession VARCHAR(160) NULL,
  annual_income DECIMAL(14, 2) NULL,
  family_details TEXT NULL,
  profile_photo_url VARCHAR(500) NULL,
  photo_data MEDIUMBLOB NULL,
  photo_mime VARCHAR(40) NULL,
  bio TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_profiles_user (user_id),
  KEY idx_profiles_search (native_district, gender, date_of_birth),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS connections (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sender_id INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  status ENUM('Requested', 'Accepted', 'Declined') NOT NULL DEFAULT 'Requested',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_connections_pair (sender_id, receiver_id),
  KEY idx_connections_receiver_status (receiver_id, status),
  CONSTRAINT fk_connections_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_connections_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_connections_distinct CHECK (sender_id <> receiver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  duration_months TINYINT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  amount DECIMAL(10, 2) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_plan_duration (duration_months)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO subscription_plans (duration_months, name, amount, currency) VALUES
  (1, '1 month', 99.00, 'INR'),
  (3, '3 months', NULL, 'INR'),
  (6, '6 months', NULL, 'INR'),
  (12, '12 months', NULL, 'INR')
ON DUPLICATE KEY UPDATE name = VALUES(name);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  plan_id TINYINT UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  transaction_reference VARCHAR(120) NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewed_by INT UNSIGNED NULL,
  review_note VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_reference (transaction_reference),
  KEY idx_payments_status_created (status, created_at),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  CONSTRAINT fk_payments_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  plan_id TINYINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  status ENUM('Pending', 'Active', 'Rejected', 'Expired') NOT NULL DEFAULT 'Pending',
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_payment (payment_id),
  KEY idx_subscriptions_user_status_end (user_id, status, ends_at),
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  CONSTRAINT fk_subscriptions_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
