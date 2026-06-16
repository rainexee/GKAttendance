-- ============================================================
-- GKAttendance — Events System Migration
-- Run this once against your GKAttendance database
-- ============================================================

USE GKAttendance;

-- Events table: stores admin-created dynamic events
CREATE TABLE IF NOT EXISTS Events (
    event_id    INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    location    VARCHAR(255),
    description TEXT,
    start_time  DATETIME NOT NULL,
    end_time    DATETIME,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EventAssignments: links users to events (many-to-many)
CREATE TABLE IF NOT EXISTS EventAssignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id      INT NOT NULL,
    user_id       INT NOT NULL,
    assigned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_assignment (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES Events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES Person(user_id)  ON DELETE CASCADE
);
