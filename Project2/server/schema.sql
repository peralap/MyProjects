CREATE DATABASE IF NOT EXISTS atoz_gig_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE atoz_gig_db;

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('customer', 'gigworker', 'admin') NOT NULL,
    phone VARCHAR(15) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gig_workers (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    service_type VARCHAR(100) NOT NULL,
    experience_years SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    hourly_rate DECIMAL(10, 2) NOT NULL,
    status ENUM('available', 'busy', 'inactive') NOT NULL DEFAULT 'available',
    CONSTRAINT fk_gig_workers_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT chk_gig_workers_rate CHECK (hourly_rate > 0)
);

CREATE TABLE bookings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    worker_id INT UNSIGNED NOT NULL,
    booking_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hours DECIMAL(5, 2) NOT NULL,
    status ENUM('pending', 'approved', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_status ENUM('unpaid', 'paid') NOT NULL DEFAULT 'unpaid',
    CONSTRAINT fk_bookings_customer
        FOREIGN KEY (customer_id) REFERENCES users(id),
    CONSTRAINT fk_bookings_worker
        FOREIGN KEY (worker_id) REFERENCES gig_workers(id),
    CONSTRAINT chk_bookings_hours CHECK (hours > 0 AND hours <= 24),
    CONSTRAINT chk_bookings_amount CHECK (total_amount > 0),
    INDEX idx_bookings_customer_date (customer_id, booking_date)
);
