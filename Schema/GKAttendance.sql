CREATE SCHEMA IF NOT EXISTS GKAttendance;
USE GKAttendance;
DROP SCHEMA GKAttendance;
DROP TABLE IF EXISTS Logging;
SELECT * FROM Person;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS ID;
DROP TABLE IF EXISTS Person;
CREATE TABLE IF NOT EXISTS ID(
unique_id INT PRIMARY KEY,
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
    unique_id INT,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

## Logging is matched everytime unique_id is entered into the system. Add a table where it logs the time the account was
CREATE TABLE IF NOT EXISTS Logging(
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    date_logged DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INT,

    FOREIGN KEY (user_id) REFERENCES Person(user_id)

);

CREATE TABLE IF NOT EXISTS Admins(
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255),
    password VARCHAR(255)
);

INSERT INTO Admins (username, password) VALUES ('admin', 'admin123');

CREATE USER 'GKAttendance_LowPriority'@'localhost' IDENTIFIED BY 'n0root4u!';
CREATE USER 'GKAttendance_SuperAdmin'@'localhost' IDENTIFIED BY 'f4llr00taccess!';

GRANT ALL PRIVILEGES ON GKAttendance.* TO 'GKAttendance_SuperAdmin'@'localhost';
FLUSH PRIVILEGES;

GRANT SELECT, INSERT, UPDATE ON GKAttendance.* TO 'public_lowprio'@'localhost';
FLUSH PRIVILEGES;

SELECT * From Admins;


DELETE FROM Admins where admin_id = 3;


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

SELECT * FROM Role;

DELETE FROM Role where role_id >0;
Select * from Person;
INSERT INTO Role(role_id, role_name) VALUES
(1, "Student"),
(2, "Staff"),
(3, "Researcher"),
(4, "Professor"),
(5, "Visitor");
