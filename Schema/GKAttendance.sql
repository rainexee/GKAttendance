CREATE SCHEMA IF NOT EXISTS GKAttendance;
USE GKAttendance;

CREATE TABLE IF NOT EXISTS Person(
	user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255),
    username VARCHAR(255),
    email VARCHAR(255),
    password VARCHAR(255),
    lab_id INT,
    role_id INT,
    FOREIGN KEY (lab_id) REFERENCES GKLab(lab_id),
    FOREIGN KEY (role_id) references Role(role_id)
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

CREATE USER 'GKAttendance_LowPriority'@'localhost' IDENTIFIED BY 'n0root4u!';
CREATE USER 'GKAttendance_SuperAdmin'@'localhost' IDENTIFIED BY 'f4llr00taccess!';

GRANT ALL PRIVILEGES ON database_name.* TO 'GKAttendance_SuperAdmin'@'localhost';
FLUSH PRIVILEGES;

GRANT SELECT, INSERT, UPDATE ON GKAttendance.* TO 'public_lowprio'@'localhost';
FLUSH PRIVILEGES;

