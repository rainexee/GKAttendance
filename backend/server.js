const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Load environment variables from the root .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT;

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const transport = nodemailer.createTransport({

    service: process.env.EMAIL_PROVIDER,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }

})
// Convert pool to use promises
const promisePool = pool.promise();


// Middleware
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend')))
// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'GKAttendance API is running' });
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/signup.html'));
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/reset-password.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/adminDashboard.html'));
});

async function hashPassword(password) {
    const saltRounds = 10;

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
}

async function comparePassword(plainPassword, hashedPassword) {
    if (hashedPassword && (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$') || hashedPassword.startsWith('$2y$'))) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }
    return plainPassword === hashedPassword;
}
app.post('/api/admin/forgotpassword', async (req, res) => {
    const { usernameOrEmail } = req.body;

    if (!usernameOrEmail) {
        return res.status(400).json({
            success: false,
            message: 'Username or Email is required'
        });
    }

    try {
        const [rows] = await promisePool.query(
            'SELECT * FROM Admins WHERE username = ? OR email = ?',
            [usernameOrEmail, usernameOrEmail]
        );

        if (rows.length === 0) {
            // Generic success response to avoid user enumeration
            return res.status(200).json({
                success: true,
                message: 'If a matching account exists, a password reset code has been sent to the registered email.'
            });
        }

        const admin = rows[0];
        const email = admin.email;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'No email address registered for this account. Contact system administrator.'
            });
        }

        // Generate a 6-digit verification code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Expiration: 1 hour from now
        const expires = new Date(Date.now() + 3600000);

        // Store code in DB
        await promisePool.query(
            'UPDATE Admins SET reset_token = ?, reset_token_expires = ? WHERE admin_id = ?',
            [code, expires, admin.admin_id]
        );

        // Send Email
        const mailOptions = {
            from: `"GKAttendance Support" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'GKAttendance - Admin Password Reset Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h2 style="color: #3b82f6; margin: 0;">GKAttendance</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Admin Portal Support</p>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 24px;" />
                    <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${admin.username}</strong>,</p>
                    <p style="font-size: 16px; line-height: 1.5;">We received a request to reset the password for your administrator account.</p>
                    <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px;">Your password reset verification code is:</p>
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="background-color: #f1f5f9; color: #0f172a; padding: 16px 24px; font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; display: inline-block; border-radius: 8px; border: 1px solid #cbd5e1;">${code}</div>
                    </div>
                    <p style="font-size: 16px; line-height: 1.5; margin-bottom: 24px; text-align: center; color: #64748b;">This code is valid for <strong>1 hour</strong>.</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 24px;" />
                    <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; text-align: center;">If you did not request this, you can safely ignore this email. Your password will remain unchanged.</p>
                </div>
            `
        };

        await transport.sendMail(mailOptions);

        res.status(200).json({
            success: true,
            message: 'If a matching account exists, a password reset code has been sent to the registered email.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while processing your request.'
        });
    }
});

app.post('/api/admin/verify-reset-code', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({
            success: false,
            message: 'Verification code is required'
        });
    }

    try {
        const [rows] = await promisePool.query(
            'SELECT admin_id FROM Admins WHERE reset_token = ? AND reset_token_expires > NOW()',
            [code]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification code'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Verification code is valid'
        });

    } catch (error) {
        console.error('Verify reset code error:', error);

        return res.status(500).json({
            success: false,
            message: 'Server error while verifying code'
        });
    }
});

app.post('/api/admin/resetpassword', async (req, res) => {
    const { code, password } = req.body;

    if (!code || !password) {
        return res.status(400).json({
            success: false,
            message: 'Verification code and new password are required'
        });
    }

    try {
        // Find admin with code that has not expired
        const [rows] = await promisePool.query(
            'SELECT * FROM Admins WHERE reset_token = ? AND reset_token_expires > NOW()',
            [code]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification code'
            });
        }

        const admin = rows[0];

        // Hash the new password
        const hashedPassword = await hashPassword(password);

        // Update password and clear token
        await promisePool.query(
            'UPDATE Admins SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE admin_id = ?',
            [hashedPassword, admin.admin_id]
        );

        res.status(200).json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while resetting your password.'
        });
    }
});
// Admin Login Endpoint
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        //TO-DO: BCRYPT LOGIN

        const [rows] = await promisePool.query(
            'SELECT * FROM Admins WHERE username = ?',
            [username]
        );

        let loginSuccess = false;
        if (rows.length > 0) {
            const admin = rows[0];
            loginSuccess = await comparePassword(password, admin.password);
        }

        if (loginSuccess) {
            res.status(200).json({
                success: true,
                message: 'Login successful',
                token: 'mock-jwt-token-xyz789' // In production, generate a real JWT
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});


// Get all persons (users) with their roles and labs
app.get('/api/persons', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT 
                p.user_id,
                p.full_name,
                p.username,
                p.email,
                p.lab_id,
                p.role_id,
                p.created_at,
                r.role_name,
                gl.lab_code,
                gl.lab_name,
                p.unique_id,
                i.dlsu_idnumber
            FROM Person p
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            LEFT JOIN ID i ON p.unique_id = i.unique_id
            ORDER BY p.user_id DESC
        `);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching persons:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching persons data'
        });
    }
});

// Add a new log entry (RFID Tap)
app.post('/api/logs', async (req, res) => {

    const { user_id } = req.body;

    // Business Hours
    const OPEN_HOUR = 9;   // 9 AM
    const CLOSE_HOUR = 17; // 5 PM

    try {

        // Check if user exists
        const [users] = await promisePool.query(
            'SELECT * FROM Person WHERE user_id = ?',
            [user_id]
        );

        if (users.length === 0) {

            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Current time
        const now = new Date();
        const currentHour = now.getHours();

        // Outside business hours
        if (currentHour < OPEN_HOUR || currentHour >= CLOSE_HOUR) {

            await promisePool.query(
                'INSERT INTO Logging (user_id, status) VALUES (?, ?)',
                [user_id, 'DENIED_AFTER_HOURS']
            );

            return res.status(403).json({
                success: false,
                message: 'Access denied: Outside business hours',
                status: 'DENIED_AFTER_HOURS'
            });
        }

        // Get latest log
        const [latestLogs] = await promisePool.query(`
            SELECT *
            FROM Logging
            WHERE user_id = ?
            ORDER BY date_logged DESC
            LIMIT 1
        `, [user_id]);

        let newStatus = 'LOGIN';

        if (latestLogs.length > 0) {

            const lastLog = latestLogs[0];

            const lastTime = new Date(lastLog.date_logged);

            // REMOVE DUPLICATE TAP DETECTION
            // (deleted completely)

            // Toggle LOGIN / LOGOUT
            if (lastLog.status === 'LOGIN') {
                newStatus = 'LOGOUT';
            } else {
                newStatus = 'LOGIN';
            }
        }

        // Insert new log
        const [result] = await promisePool.query(
            'INSERT INTO Logging (user_id, status) VALUES (?, ?)',
            [user_id, newStatus]
        );

        res.status(201).json({
            success: true,
            message: `${newStatus} successful`,
            status: newStatus,
            logId: result.insertId,
            timestamp: now
        });

    } catch (error) {

        console.error('Error creating log:', error);

        res.status(500).json({
            success: false,
            message: 'Error creating log entry'
        });
    }
});
// Get dashboard statistics
app.get('/api/stats', async (req, res) => {
    try {
        // Get total users
        const [totalUsers] = await promisePool.query('SELECT COUNT(*) as count FROM Person');

        // Get total logs
        const [totalLogs] = await promisePool.query('SELECT COUNT(*) as count FROM Logging');

        // Get today's logs
        const [todayLogs] = await promisePool.query(`
            SELECT COUNT(*) as count FROM Logging 
            WHERE DATE(date_logged) = CURDATE()
        `);

        // Get recent logs (last 7 days)
        const [recentLogs] = await promisePool.query(`
            SELECT COUNT(*) as count FROM Logging 
            WHERE date_logged >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);

        // Get users by role
        const [usersByRole] = await promisePool.query(`
            SELECT r.role_name, COUNT(p.user_id) as count
            FROM Person p
            LEFT JOIN Role r ON p.role_id = r.role_id
            GROUP BY r.role_name
        `);

        res.status(200).json({
            success: true,
            data: {
                totalUsers: totalUsers[0].count,
                totalLogs: totalLogs[0].count,
                todayLogs: todayLogs[0].count,
                recentLogs: recentLogs[0].count,
                usersByRole
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});


// Add a new log entry (RFID Tap)
app.post('/api/logs', async (req, res) => {
    const { user_id } = req.body;

    // Business Hours
    const OPEN_HOUR = 9;   // 9 AM
    const CLOSE_HOUR = 17; // 5 PM

    try {

        // Check if user exists
        const [users] = await promisePool.query(
            'SELECT * FROM Person WHERE user_id = ?',
            [user_id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Current server time
        const now = new Date();

        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Outside business hours
        if (currentHour < OPEN_HOUR || currentHour >= CLOSE_HOUR) {

            await promisePool.query(
                'INSERT INTO Logging (user_id, status) VALUES (?, ?)',
                [user_id, 'DENIED_AFTER_HOURS']
            );

            return res.status(403).json({
                success: false,
                message: 'Access denied: Outside business hours'
            });
        }

        // Get latest log of the user
        const [latestLogs] = await promisePool.query(`
            SELECT *
            FROM Logging
            WHERE user_id = ?
            ORDER BY date_logged DESC
            LIMIT 1
        `, [user_id]);

        let newStatus = 'LOGIN';

        if (latestLogs.length > 0) {

            const lastLog = latestLogs[0];

            const lastTime = new Date(lastLog.date_logged);

            // Prevent duplicate taps within 10 seconds
            const diffSeconds = (now - lastTime) / 1000;

            if (diffSeconds < 10) {

                await promisePool.query(
                    'INSERT INTO Logging (user_id, status) VALUES (?, ?)',
                    [user_id, 'DENIED_DUPLICATE']
                );

                return res.status(429).json({
                    success: false,
                    message: 'Duplicate tap detected'
                });
            }

            // Toggle LOGIN/LOGOUT
            if (lastLog.status === 'LOGIN') {
                newStatus = 'LOGOUT';
            } else {
                newStatus = 'LOGIN';
            }
        }

        // Save log
        const [result] = await promisePool.query(
            'INSERT INTO Logging (user_id, status) VALUES (?, ?)',
            [user_id, newStatus]
        );

        res.status(201).json({
            success: true,
            message: `${newStatus} successful`,
            status: newStatus,
            logId: result.insertId,
            timestamp: now
        });

    } catch (error) {
        console.error('Error creating log:', error);

        res.status(500).json({
            success: false,
            message: 'Error creating log entry'
        });
    }
});

// Add a new person (user)
app.post('/api/persons', async (req, res) => {
    const { full_name, username, email, password, lab_id, role_id, dlsu_idnumber, unique_id } = req.body;

    if (!dlsu_idnumber || !unique_id) {
        return res.status(400).json({
            success: false,
            message: 'DLSU ID number and RFID Card ID are required'
        });
    }

    const connection = await promisePool.getConnection();
    try {
        // Check if username or email already exists
        const [existing] = await connection.query(
            'SELECT * FROM Person WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existing.length > 0) {
            const isUsernameDup = existing.some(u => u.username === username);
            connection.release();
            return res.status(400).json({
                success: false,
                message: isUsernameDup ? 'Username is already taken' : 'Email is already registered'
            });
        }

        // Check if unique_id or dlsu_idnumber already exists in ID table
        const [existingId] = await connection.query(
            'SELECT * FROM ID WHERE unique_id = ? OR dlsu_idnumber = ?',
            [unique_id, parseInt(dlsu_idnumber, 10)]
        );

        if (existingId.length > 0) {
            const isRfidDup = existingId.some(id => id.unique_id === unique_id);
            connection.release();
            return res.status(400).json({
                success: false,
                message: isRfidDup ? 'RFID card is already registered' : 'DLSU ID number is already registered'
            });
        }

        // Begin Transaction
        await connection.beginTransaction();

        // 1. Insert into ID table
        await connection.query(
            'INSERT INTO ID (unique_id, dlsu_idnumber) VALUES (?, ?)',
            [unique_id, parseInt(dlsu_idnumber, 10)]
        );

        // Hash password before saving
        const hashedPassword = await hashPassword(password);

        // 2. Insert into Person table
        const [result] = await connection.query(
            'INSERT INTO Person (full_name, username, email, password, lab_id, role_id, unique_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [full_name, username, email, hashedPassword, lab_id || null, role_id || null, unique_id]
        );

        // Commit transaction
        await connection.commit();
        connection.release();

        res.status(201).json({
            success: true,
            message: 'Person registered successfully',
            userId: result.insertId
        });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error adding person:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering user'
        });
    }
});

// Get persons with live attendance status
app.get('/api/persons/status', async (req, res) => {
    try {

        const [rows] = await promisePool.query(`
            SELECT 
                p.user_id,
                p.full_name,
                p.username,
                p.email,
                p.lab_id,
                p.role_id,
                p.created_at,

                r.role_name,

                gl.lab_code,
                gl.lab_name,

                p.unique_id,
                i.dlsu_idnumber,

                (
                    SELECT l.status
                    FROM Logging l
                    WHERE l.user_id = p.user_id
                    ORDER BY l.date_logged DESC
                    LIMIT 1
                ) AS current_status

            FROM Person p

            LEFT JOIN Role r
                ON p.role_id = r.role_id

            LEFT JOIN GKLab gl
                ON p.lab_id = gl.lab_id

            LEFT JOIN ID i
                ON p.unique_id = i.unique_id

            ORDER BY p.user_id DESC
        `);

        res.status(200).json({
            success: true,
            data: rows
        });

    } catch (error) {

        console.error('Error fetching attendance statuses:', error);

        res.status(500).json({
            success: false,
            message: 'Error fetching attendance status data'
        });
    }
});

// Update a person
app.put('/api/persons/:id', async (req, res) => {
    const { id } = req.params;
    const { full_name, username, email, lab_id, role_id } = req.body;

    try {
        await promisePool.query(
            'UPDATE Person SET full_name = ?, username = ?, email = ?, lab_id = ?, role_id = ? WHERE user_id = ?',
            [full_name, username, email, lab_id, role_id, id]
        );

        res.status(200).json({
            success: true,
            message: 'Person updated successfully'
        });
    } catch (error) {
        console.error('Error updating person:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating person'
        });
    }
});

// Delete a person
app.delete('/api/persons/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // First delete associated logs
        await promisePool.query('DELETE FROM Logging WHERE user_id = ?', [id]);
        // Then delete the person
        await promisePool.query('DELETE FROM Person WHERE user_id = ?', [id]);

        res.status(200).json({
            success: true,
            message: 'Person deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting person:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting person'
        });
    }
});

// Get all labs
app.get('/api/labs', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM GKLab ORDER BY lab_name');
        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching labs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching labs'
        });
    }
});

// Get all roles
app.get('/api/roles', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM Role ORDER BY role_name');
        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching roles'
        });
    }
});


// Export logs as CSV
app.get('/api/export/logs', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT 
                l.log_id,
                l.date_logged,
                p.full_name,
                p.email,
                r.role_name,
                gl.lab_name
            FROM Logging l
            LEFT JOIN Person p ON l.user_id = p.user_id
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            ORDER BY l.date_logged DESC
        `);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error exporting logs:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting logs'
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`GKAttendance Backend running on http://localhost:${PORT}`);
});
