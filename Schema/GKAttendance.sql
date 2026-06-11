CREATE SCHEMA IF NOT EXISTS GKAttendance;
USE GKAttendance;
DROP SCHEMA GKAttendance;
DROP TABLE IF EXISTS Logging;
SELECT * FROM Person;
SET FOREIGN_KEY_CHECKS = 0;




CREATE TABLE IF NOT EXISTS ID(
unique_id VARCHAR(255) PRIMARY KEY,
dlsu_idnumber INT
);

CREATE TABLE IF NOT EXISTS Person(
	user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255),
    username VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255),
    lab_id INT,
    role_id INT,
    unique_id VARCHAR(255),
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	reset_token VARCHAR(255),
    reset_token_expires DATETIME,
    FOREIGN KEY (lab_id) REFERENCES GKLab(lab_id),
    FOREIGN KEY (role_id) references Role(role_id),
    FOREIGN KEY (unique_id) references ID(unique_id)
);


CREATE TABLE IF NOT EXISTS Role(
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE
);

CREATE TABLE IF NOT EXISTS GKLab(
	lab_id INT AUTO_INCREMENT PRIMARY KEY,
    lab_code VARCHAR(40) UNIQUE ,
    lab_name VARCHAR(255)
);


drop table if exists Logging;
CREATE TABLE IF NOT EXISTS Logging(
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    date_logged DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INT,
	    status ENUM(
        'LOGIN',
        'LOGOUT',
        'DENIED_EARLY',
        'DENIED_LATE',
        'DENIED_DUPLICATE',
        'DENIED_AFTER_HOURS'
    ) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES Person(user_id)
);




CREATE TABLE IF NOT EXISTS Admins(
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255),
    password VARCHAR(255),
    reset_token VARCHAR(255),
    reset_token_expires DATETIME
);

INSERT INTO Admins (username, password) VALUES ('admin', 'admin123');

CREATE USER 'GKAttendance_LowPriority'@'localhost' IDENTIFIED BY 'n0root4u!';
CREATE USER 'GKAttendance_SuperAdmin'@'localhost' IDENTIFIED BY 'f4llr00taccess!';

GRANT ALL PRIVILEGES ON GKAttendance.* TO 'GKAttendance_SuperAdmin'@'localhost';
FLUSH PRIVILEGES;

GRANT SELECT, INSERT, UPDATE ON GKAttendance.* TO 'public_lowprio'@'localhost';
FLUSH PRIVILEGES;


SET SQL_SAFE_UPDATES = 0;
DELETE FROM ID where unique_id = 2059985069;
INSERT INTO GKLab (lab_id, lab_code, lab_name) VALUES
(1, 'CeLT', 'Center for Language Technologies'),
(2, 'CeHCI', 'Center for Human-Computer Innovations'),
(3, 'Cite4D', 'Center for ICT for Development'),
(4, 'CAR', 'Center for Automation Research'),
(5, 'CNIS', 'Center for Networking and Information Security'),
(6, 'CIVI', 'Computational Imaging and Visual Innovations'),
(7, 'GAME Lab', 'Graphics, Animation, Multimedia and Entertainment Laboratory'),
(8, 'HXIL', 'Human-X Interactions'),
(9, 'TE3D', 'Technology, Education, Entertainment, Empathy, Design House'),
(10, 'Bioinformatics Lab', 'Bioinformatics Lab');


INSERT INTO Role(role_id, role_name) VALUES
(1, "Student"),
(2, "Staff"),
(3, "Researcher"),
(4, "Professor"),
(5, "Visitor");



CREATE TABLE IF NOT EXISTS Calendar (
    calendar_date DATE PRIMARY KEY,
    day_name ENUM('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NOT NULL,
    is_academic_day BOOLEAN DEFAULT TRUE, -- False for Sundays, term breaks, etc.
    is_holiday BOOLEAN DEFAULT FALSE,
    holiday_description VARCHAR(255) DEFAULT NULL,
    
    -- Overrides for default lab hours on specific days
    custom_open_time TIME DEFAULT NULL,   -- e.g., '08:00:00'
    custom_close_time TIME DEFAULT NULL,  -- e.g., '17:00:00'
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS LabSchedule (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    lab_id INT,
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES Person(user_id) ON DELETE CASCADE,
    FOREIGN KEY (lab_id) REFERENCES GKLab(lab_id) ON DELETE CASCADE
);
