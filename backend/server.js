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

// Middleware - Single organized CORS policy configuration
app.use(cors({
    origin: 'https://gkattendance.vercel.app',
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

module.exports = app;

const BASE = process.env.API_BASE_URL;

// Keep your local listening block, but wrap it so it doesn't break Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running locally on port ${PORT}`));
}

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
});

// Convert pool to use promises
const promisePool = pool.promise();

// Password Utilities
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

async function comparePassword(plainPassword, hashedPassword) {
    if (hashedPassword && (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$') || hashedPassword.startsWith('$2y$'))) {
        return await bcrypt.compare(plainPassword, hashedPassword);
    }
    return plainPassword === hashedPassword;
}

/* ==========================================================================
   STATIC VIEWS & REDIRECTS
   ========================================================================== */
app.get('/', (req, res) => {
    res.redirect('/index');
});

app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/userlogin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/userLogin.html'));
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

app.get('/userdashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/userDashboard.html'));
});


/* ==========================================================================
   SYSTEM LOGS / DASHBOARD STATS API
   ========================================================================== */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'GKAttendance API is running' });
});

// Get all scan logs for the admin dashboard
app.get('/api/logs', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT
                l.log_id,
                l.date_logged,
                l.status,
                p.full_name,
                p.unique_id,
                r.role_name,
                gl.lab_name
            FROM Logging l
            LEFT JOIN Person p ON l.user_id = p.user_id
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            ORDER BY l.date_logged DESC
            LIMIT 500
        `);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ success: false, message: 'Error fetching logs' });
    }
});

// Add a new log entry (RFID Tap)
app.post('/api/logs', async (req, res) => {
    const { unique_id } = req.body;

    if (!unique_id) {
        return res.status(400).json({ success: false, message: 'No Card ID provided.' });
    }

    try {
        // STEP 1: Find the user linked to this RFID card
        const [userResults] = await promisePool.query(
            'SELECT user_id FROM Person WHERE unique_id = ?',
            [unique_id]
        );

        if (userResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Unregistered Card! Please register this card first.'
            });
        }

        const internalUserId = userResults[0].user_id;

        // STEP 2: Check the last log to toggle LOGIN <-> LOGOUT
        const [lastLog] = await promisePool.query(
            'SELECT status FROM Logging WHERE user_id = ? ORDER BY date_logged DESC LIMIT 1',
            [internalUserId]
        );

        const lastStatus = lastLog.length > 0 ? lastLog[0].status : null;
        const newStatus = lastStatus === 'LOGIN' ? 'LOGOUT' : 'LOGIN';

        // STEP 3: Insert the new log
        await promisePool.query(
            'INSERT INTO Logging (user_id, status) VALUES (?, ?)',
            [internalUserId, newStatus]
        );

        // STEP 4: Fetch full user info for the response
        const [personRows] = await promisePool.query(`
            SELECT p.full_name, p.email, r.role_name, gl.lab_name, i.dlsu_idnumber
            FROM Person p
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            LEFT JOIN ID i ON p.unique_id = i.unique_id
            WHERE p.user_id = ?
        `, [internalUserId]);

        res.json({
            success: true,
            message: 'Scan logged successfully!',
            status: newStatus,
            user: personRows[0] || null
        });

    } catch (error) {
        console.error('Database error during scan:', error);
        res.status(500).json({ success: false, message: 'Failed to log attendance.' });
    }
});

// Get dashboard statistics
app.get('/api/stats', async (req, res) => {
    try {
        const [totalUsers] = await promisePool.query('SELECT COUNT(*) as count FROM Person');
        const [totalLogs] = await promisePool.query('SELECT COUNT(*) as count FROM Logging');
        const [todayLogs] = await promisePool.query('SELECT COUNT(*) as count FROM Logging WHERE DATE(date_logged) = CURDATE()');
        const [recentLogs] = await promisePool.query('SELECT COUNT(*) as count FROM Logging WHERE date_logged >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
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
        res.status(500).json({ success: false, message: 'Error fetching statistics' });
    }
});


/* ==========================================================================
   USER IDENTITY MANAGEMENT (PERSONS) API
   ========================================================================== */

// Get all persons (users) with their roles and labs
app.get('/api/persons', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT 
                p.user_id, p.full_name, p.username, p.email, p.lab_id, p.role_id, p.created_at,
                r.role_name, gl.lab_code, gl.lab_name, p.unique_id, i.dlsu_idnumber
            FROM Person p
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            LEFT JOIN ID i ON p.unique_id = i.unique_id
            ORDER BY p.user_id DESC
        `);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching persons:', error);
        res.status(500).json({ success: false, message: 'Error fetching persons data' });
    }
});

// Add a new person (user) - WITH TRANSACTION FIXED AND COMPLETED
app.post('/api/persons', async (req, res) => {
    const { full_name, username, email, password, lab_id, role_id, dlsu_idnumber, unique_id } = req.body;

    if (!dlsu_idnumber || !unique_id || !username || !email || !password) {
        return res.status(400).json({
            success: false,
            message: 'All core registration parameters (ID, RFID, Username, Email, Password) are required'
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

        // 2. Hash User Password
        const hashedPassword = await hashPassword(password);

        // 3. Insert into Person Table
        await connection.query(
            'INSERT INTO Person (full_name, username, email, password, lab_id, role_id, unique_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [full_name, username, email, hashedPassword, lab_id || null, role_id || null, unique_id]
        );

        // Commit changes securely
        await connection.commit();
        connection.release();

        res.status(201).json({ success: true, message: 'User registered successfully!' });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Transaction rollback error during user registration:', error);
        res.status(500).json({ success: false, message: 'An error occurred during account creation.' });
    }
});


/* ==========================================================================
   STANDARD USER BASE API ENDPOINTS
   ========================================================================== */
app.post('/api/user/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await promisePool.query(`
            SELECT 
                p.user_id, p.full_name, p.username, p.email, p.password, p.unique_id, p.created_at,
                r.role_name, r.role_id, gl.lab_name, i.dlsu_idnumber
            FROM Person p
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            LEFT JOIN ID i ON p.unique_id = i.unique_id
            WHERE p.username = ?
        `, [username]);

        let loginSuccess = false;
        if (rows.length > 0) {
            loginSuccess = await comparePassword(password, rows[0].password);
        }

        if (loginSuccess) {
            const user = rows[0];
            const { password: _, ...safeUser } = user;
            const isAdmin = user.role_name === 'Admin' || user.role_id === 1;

            res.status(200).json({
                success: true,
                message: 'Login successful',
                token: 'mock-jwt-token-' + Date.now(),
                role: isAdmin ? 'admin' : 'user',
                user: safeUser
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.get('/api/user/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query(`
            SELECT 
                p.user_id, p.full_name, p.username, p.email, p.lab_id, p.role_id, p.created_at, p.unique_id,
                r.role_name, gl.lab_code, gl.lab_name, i.dlsu_idnumber
            FROM Person p
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            LEFT JOIN ID i ON p.unique_id = i.unique_id
            WHERE p.user_id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Error fetching user data' });
    }
});

app.get('/api/user/:id/logs', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query(`
            SELECT l.log_id, l.date_logged, l.user_id, l.status
            FROM Logging l
            WHERE l.user_id = ?
            ORDER BY l.date_logged DESC
        `, [id]);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching user logs:', error);
        res.status(500).json({ success: false, message: 'Error fetching attendance logs' });
    }
});

app.get('/api/user/:id/stats', async (req, res) => {
    const { id } = req.params;
    try {
        const [totalVisits] = await promisePool.query('SELECT COUNT(*) as count FROM Logging WHERE user_id = ? AND status IN ("LOGIN", "LOGOUT")', [id]);
        const [todayStatus] = await promisePool.query('SELECT status, date_logged FROM Logging WHERE user_id = ? AND DATE(date_logged) = CURDATE() ORDER BY date_logged DESC LIMIT 1', [id]);
        const [thisMonth] = await promisePool.query('SELECT COUNT(*) as count FROM Logging WHERE user_id = ? AND MONTH(date_logged) = MONTH(CURDATE()) AND YEAR(date_logged) = YEAR(CURDATE()) AND status IN ("LOGIN", "LOGOUT")', [id]);

        res.status(200).json({
            success: true,
            data: {
                totalVisits: totalVisits[0].count,
                todayStatus: todayStatus.length > 0 ? todayStatus[0].status : null,
                thisMonthVisits: thisMonth[0].count
            }
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching statistics' });
    }
});

// USER Forgot Password Flow
app.post('/api/user/forgotpassword', async (req, res) => {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) {
        return res.status(400).json({ success: false, message: 'Username or Email is required' });
    }

    try {
        const [rows] = await promisePool.query('SELECT * FROM Person WHERE username = ? OR email = ?', [usernameOrEmail, usernameOrEmail]);
        if (rows.length === 0) {
            return res.status(200).json({ success: true, message: 'If a matching account exists, a password reset code has been sent to the registered email.' });
        }

        const person = rows[0];
        const email = person.email;

        if (!email) {
            return res.status(400).json({ success: false, message: 'No email address registered for this account. Contact system administrator.' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 3600000); // 1 hour

        await promisePool.query('UPDATE Person SET reset_token = ?, reset_token_expires = ? WHERE user_id = ?', [code, expires, person.user_id]);

        const mailOptions = {
            from: `"GKAttendance Support" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'GKAttendance - Password Reset Code',
            html: `<p>Your verification code is <b>${code}</b>. It is valid for 1 hour.</p>`
        };

        await transport.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'If a matching account exists, a password reset code has been sent to the registered email.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
    }
});

app.post('/api/user/verify-reset-code', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Verification code is required' });

    try {
        const [rows] = await promisePool.query('SELECT user_id FROM Person WHERE reset_token = ? AND reset_token_expires > ?', [code, new Date()]);
        if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        return res.status(200).json({ success: true, message: 'Verification code is valid' });
    } catch (error) {
        console.error('Verify reset code error:', error);
        return res.status(500).json({ success: false, message: 'Server error while verifying code' });
    }
});

// FIXED CONSOLIDATION: Kept single functional endpoint wrapper with proper runtime fallback validation rules
app.post('/api/user/resetpassword', async (req, res) => {
    const { code, password } = req.body;
    if (!code || !password) {
        return res.status(400).json({ success: false, message: 'Verification code and new password are required' });
    }

    try {
        const [rows] = await promisePool.query('SELECT * FROM Person WHERE reset_token = ? AND reset_token_expires > ?', [code, new Date()]);
        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        }

        const user = rows[0];
        const hashedPassword = await hashPassword(password);

        await promisePool.query(
            'UPDATE Person SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE user_id = ?',
            [hashedPassword, user.user_id]
        );

        res.status(200).json({ success: true, message: 'Password reset successful. You can now login with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'An error occurred while resetting your password.' });
    }
});


/* ==========================================================================
   ADMIN AUTHENTICATION ENDPOINTS
   ========================================================================== */
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await promisePool.query('SELECT * FROM Admins WHERE username = ?', [username]);
        let loginSuccess = false;
        if (rows.length > 0) {
            loginSuccess = await comparePassword(password, rows[0].password);
        }

        if (loginSuccess) {
            res.status(200).json({
                success: true,
                message: 'Login successful',
                token: 'mock-jwt-token-xyz789'
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Database query error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/api/admin/forgotpassword', async (req, res) => {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) return res.status(400).json({ success: false, message: 'Username or Email is required' });

    try {
        const [rows] = await promisePool.query('SELECT * FROM Admins WHERE username = ? OR email = ?', [usernameOrEmail, usernameOrEmail]);
        if (rows.length === 0) {
            return res.status(200).json({ success: true, message: 'If a matching account exists, a password reset code has been sent to the registered email.' });
        }

        const admin = rows[0];
        if (!admin.email) {
            return res.status(400).json({ success: false, message: 'No email address registered for this account. Contact system administrator.' });
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 3600000);

        await promisePool.query('UPDATE Admins SET reset_token = ?, reset_token_expires = ? WHERE admin_id = ?', [code, expires, admin.admin_id]);

        const mailOptions = {
            from: `"GKAttendance Support" <${process.env.EMAIL_USER}>`,
            to: admin.email,
            subject: 'GKAttendance - Admin Password Reset Code',
            html: `<p>Your admin verification code is <b>${code}</b>.</p>`
        };

        await transport.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'If a matching account exists, a password reset code has been sent to the registered email.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
    }
});

app.post('/api/admin/verify-reset-code', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Verification code is required' });

    try {
        const [rows] = await promisePool.query('SELECT admin_id FROM Admins WHERE reset_token = ? AND reset_token_expires > ?', [code, new Date()]);
        if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        return res.status(200).json({ success: true, message: 'Verification code is valid' });
    } catch (error) {
        console.error('Verify reset code error:', error);
        return res.status(500).json({ success: false, message: 'Server error while verifying code' });
    }
});

app.post('/api/admin/resetpassword', async (req, res) => {
    const { code, password } = req.body;
    if (!code || !password) return res.status(400).json({ success: false, message: 'Verification code and new password are required' });

    try {
        const [rows] = await promisePool.query('SELECT * FROM Admins WHERE reset_token = ? AND reset_token_expires > ?', [code, new Date()]);
        if (rows.length === 0) return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });

        const admin = rows[0];
        const hashedPassword = await hashPassword(password);

        await promisePool.query('UPDATE Admins SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE admin_id = ?', [hashedPassword, admin.admin_id]);
        res.status(200).json({ success: true, message: 'Password reset successful. You can now login with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'An error occurred while resetting your password.' });
    }
});