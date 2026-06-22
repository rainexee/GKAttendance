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
    pool: true,
    maxConnections: 10,
    maxMessages: Infinity,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    family: 4

});

transport.verify((err) => {
    if (err) {
        console.error('SMTP Error:', err);
    } else {
        console.log('SMTP Ready');
    }
});
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

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
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

// USER Forgot Password
app.post('/api/user/forgotpassword', async (req, res) => {
    const { usernameOrEmail } = req.body;

    if (!usernameOrEmail) {
        return res.status(400).json({
            success: false,
            message: 'Username or Email is required'
        });
    }

    try {
        const [rows] = await promisePool.query(
            'SELECT * FROM Person WHERE username = ? OR email = ?',
            [usernameOrEmail, usernameOrEmail]
        );

        if (rows.length === 0) {
            // Generic success response to avoid user enumeration
            res.status(200).json({
                success: true,
                message: 'If a matching account exists, a password reset code has been sent to the registered email.'
            });

            setImmediate(async () => {
                try {
                    console.time(`user-email-${email}`);

                    await transport.sendMail(mailOptions);

                    console.timeEnd(`user-email-${email}`);
                    console.log(`Reset email sent to ${email}`);
                } catch (err) {
                    console.error('Email send error:', err);
                }
            });

            return;
        }

        const person = rows[0];
        const email = person.email;

        if (!email) {
            // FIXED: Provided an accurate message for missing emails to match admin behavior
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
            'UPDATE Person SET reset_token = ?, reset_token_expires = ? WHERE user_id = ?',
            [code, expires, person.user_id]
        );

        // Send Email
        const mailOptions = {
            from: `"GKAttendance Support" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'GKAttendance - Password Reset Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h2 style="color: #3b82f6; margin: 0;">GKAttendance</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;"> Portal Support</p>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 24px;" />
                    <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${person.username}</strong>,</p>
                    <p style="font-size: 16px; line-height: 1.5;">We received a request to reset the password for your account.</p>
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

app.post('/api/user/verify-reset-code', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ success: false, message: 'Verification code is required' });
    }

    try {
        // FIXED: Passing Node.js's new Date()
        const [rows] = await promisePool.query(
            'SELECT user_id FROM Person WHERE reset_token = ? AND reset_token_expires > ?',
            [code, new Date()]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        }

        return res.status(200).json({ success: true, message: 'Verification code is valid' });

    } catch (error) {
        console.error('Verify reset code error:', error);
        return res.status(500).json({ success: false, message: 'Server error while verifying code' });
    }
});

app.post('/api/user/resetpassword', async (req, res) => {
    const { code, password } = req.body;

    if (!code || !password) {
        return res.status(400).json({ success: false, message: 'Verification code and new password are required' });
    }

    try {
        // FIXED: Passing Node.js's new Date()
        const [rows] = await promisePool.query(
            'SELECT * FROM Person WHERE reset_token = ? AND reset_token_expires > ?',
            [code, new Date()]
        );

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
// USER Reset Password
app.post('/api/user/resetpassword', async (req, res) => {
    const { code, password } = req.body;

    if (!code || !password) {
        return res.status(400).json({
            success: false,
            message: 'Verification code and new password are required'
        });
    }

    try {
        // Find user with code that has not expired
        const [rows] = await promisePool.query(
            'SELECT * FROM Person WHERE reset_token = ? AND reset_token_expires > NOW()',
            [code]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification code'
            });
        }

        // FIXED: Changed variable name from 'admin' to 'user' to maintain context clarity
        const user = rows[0];

        // Hash the new password
        const hashedPassword = await hashPassword(password);

        // FIXED: Changed 'person.user_id' to 'user.user_id' to resolve the ReferenceError crash
        await promisePool.query(
            'UPDATE Person SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE user_id = ?',
            [hashedPassword, user.user_id]
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


//Admin Forgot Password
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
            res.status(200).json({
                success: true,
                message: 'If a matching account exists, a password reset code has been sent to the registered email.'
            });

            setImmediate(async () => {
                try {
                    console.time(`admin-email-${email}`);

                    await transport.sendMail(mailOptions);

                    console.timeEnd(`admin-email-${email}`);
                    console.log(`Reset email sent to ${email}`);
                } catch (err) {
                    console.error('Email send error:', err);
                }
            });

            return;
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
        return res.status(400).json({ success: false, message: 'Verification code is required' });
    }

    try {
        // FIXED: Passing Node.js's new Date()
        const [rows] = await promisePool.query(
            'SELECT admin_id FROM Admins WHERE reset_token = ? AND reset_token_expires > ?',
            [code, new Date()]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        }

        return res.status(200).json({ success: true, message: 'Verification code is valid' });

    } catch (error) {
        console.error('Verify reset code error:', error);
        return res.status(500).json({ success: false, message: 'Server error while verifying code' });
    }
});

app.post('/api/admin/resetpassword', async (req, res) => {
    const { code, password } = req.body;

    if (!code || !password) {
        return res.status(400).json({ success: false, message: 'Verification code and new password are required' });
    }

    try {
        // FIXED: Passing Node.js's new Date()
        const [rows] = await promisePool.query(
            'SELECT * FROM Admins WHERE reset_token = ? AND reset_token_expires > ?',
            [code, new Date()]
        );

        if (rows.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        }

        const admin = rows[0];
        const hashedPassword = await hashPassword(password);

        await promisePool.query(
            'UPDATE Admins SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE admin_id = ?',
            [hashedPassword, admin.admin_id]
        );

        res.status(200).json({ success: true, message: 'Password reset successful. You can now login with your new password.' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'An error occurred while resetting your password.' });
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

app.get('/api/user/:id', async (req, res) => {
    const { id } = req.params;

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
                p.unique_id,
                r.role_name,
                gl.lab_code,
                gl.lab_name,
                i.dlsu_idnumber
            FROM Person p
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            LEFT JOIN ID i ON p.unique_id = i.unique_id
            WHERE p.user_id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user data'
        });
    }
});

// Get user's attendance logs
app.get('/api/user/:id/logs', async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await promisePool.query(`
            SELECT 
                l.log_id,
                l.date_logged,
                l.user_id
            FROM Logging l
            WHERE l.user_id = ?
            ORDER BY l.date_logged DESC
        `, [id]);

        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching user logs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching attendance logs'
        });
    }
});

// Get all scan logs with person details
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

// Get user statistics
app.get('/api/user/:id/stats', async (req, res) => {
    const { id } = req.params;

    try {
        // Total visits (both LOGIN and LOGOUT count as visits)
        const [totalVisits] = await promisePool.query(
            'SELECT COUNT(*) as count FROM Logging WHERE user_id = ? AND status IN ("LOGIN", "LOGOUT")',
            [id]
        );

        // Today's latest status
        const [todayStatus] = await promisePool.query(`
            SELECT status, date_logged 
            FROM Logging 
            WHERE user_id = ? AND DATE(date_logged) = CURDATE() 
            ORDER BY date_logged DESC 
            LIMIT 1
        `, [id]);

        // This month's visits
        const [thisMonth] = await promisePool.query(`
            SELECT COUNT(*) as count FROM Logging 
            WHERE user_id = ? 
            AND MONTH(date_logged) = MONTH(CURDATE()) 
            AND YEAR(date_logged) = YEAR(CURDATE())
            AND status IN ("LOGIN", "LOGOUT")
        `, [id]);

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
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});

// User login (returns role info for RBAC)
app.post('/api/user/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [rows] = await promisePool.query(`
            SELECT 
                p.user_id,
                p.full_name,
                p.username,
                p.email,
                p.password,
                p.unique_id,
                p.created_at,
                r.role_name,
                r.role_id,
                gl.lab_name,
                i.dlsu_idnumber
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
            // Remove password from response
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
// Add a new log entry (RFID Tap)
app.post('/api/logs', async (req, res) => {



    let { unique_id } = req.body;

    // sanitize scanner input (VERY IMPORTANT)
    if (unique_id) {
        unique_id = unique_id.toString().trim().replace(/\s+/g, '');
    }

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

        // pull me
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
                ) AS current_status,

                IF(a.admin_id IS NOT NULL, 1, 0) AS is_admin

            FROM Person p

            LEFT JOIN Role r
                ON p.role_id = r.role_id

            LEFT JOIN GKLab gl
                ON p.lab_id = gl.lab_id

            LEFT JOIN ID i
                ON p.unique_id = i.unique_id
                
            LEFT JOIN Admins a
                ON p.username = a.username

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

// ==========================================
// CALENDAR CONFIGURATION ROUTES
// ==========================================

// Get all calendar settings (Useful for rendering an admin calendar UI)
app.get('/api/calendar', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM Calendar ORDER BY calendar_date ASC');
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching calendar settings:', error);
        res.status(500).json({ success: false, message: 'Internal server error fetching calendar' });
    }
});

// SET (Create) a specific calendar configuration for a date
app.post('/api/calendar', async (req, res) => {
    const {
        calendar_date,
        day_name,
        is_academic_day,
        is_holiday,
        holiday_description,
        custom_open_time,
        custom_close_time
    } = req.body;

    if (!calendar_date || !day_name) {
        return res.status(400).json({ success: false, message: 'calendar_date and day_name are required fields.' });
    }

    try {
        // Prevent duplicate setups for the same date row
        const [existing] = await promisePool.query('SELECT calendar_date FROM Calendar WHERE calendar_date = ?', [calendar_date]);
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'A record for this date already exists. Use PUT /api/calendar to modify it.'
            });
        }

        await promisePool.query(`
            INSERT INTO Calendar 
            (calendar_date, day_name, is_academic_day, is_holiday, holiday_description, custom_open_time, custom_close_time) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            calendar_date,
            day_name,
            is_academic_day !== undefined ? is_academic_day : true,
            is_holiday !== undefined ? is_holiday : false,
            holiday_description || null,
            custom_open_time || null,
            custom_close_time || null
        ]);

        res.status(201).json({ success: true, message: `Calendar settings applied for ${calendar_date}` });
    } catch (error) {
        console.error('Error adding calendar configurations:', error);
        res.status(500).json({ success: false, message: 'Internal server error setting calendar configs' });
    }
});

// UPDATE calendar metrics for an existing target date
app.put('/api/calendar/:date', async (req, res) => {
    const { date } = req.params;
    const {
        day_name,
        is_academic_day,
        is_holiday,
        holiday_description,
        custom_open_time,
        custom_close_time
    } = req.body;

    try {
        const [existing] = await promisePool.query('SELECT calendar_date FROM Calendar WHERE calendar_date = ?', [date]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: `No calendar record found for date: ${date}` });
        }

        await promisePool.query(`
            UPDATE Calendar 
            SET 
                day_name = COALESCE(?, day_name),
                is_academic_day = COALESCE(?, is_academic_day),
                is_holiday = COALESCE(?, is_holiday),
                holiday_description = ?,
                custom_open_time = ?,
                custom_close_time = ?
            WHERE calendar_date = ?
        `, [
            day_name || null,
            is_academic_day !== undefined ? is_academic_day : null,
            is_holiday !== undefined ? is_holiday : null,
            holiday_description || null,
            custom_open_time || null,
            custom_close_time || null,
            date
        ]);

        res.status(200).json({ success: true, message: `Calendar configs updated successfully for ${date}` });
    } catch (error) {
        console.error('Error updating calendar configuration:', error);
        res.status(500).json({ success: false, message: 'Internal server error updating configuration' });
    }
});

// ==========================================
// EVENTS API ROUTES
// ==========================================

// GET all events
app.get('/api/events', async (req, res) => {
    try {
        const [rows] = await promisePool.query(
            'SELECT * FROM Events ORDER BY start_time ASC'
        );
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ success: false, message: 'Error fetching events' });
    }
});

// POST create a new event
app.post('/api/events', async (req, res) => {
    const { title, location, description, start_time, end_time } = req.body;

    if (!title || !start_time) {
        return res.status(400).json({ success: false, message: 'Title and start_time are required.' });
    }

    try {
        const [result] = await promisePool.query(
            'INSERT INTO Events (title, location, description, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
            [title, location || null, description || null, start_time, end_time || null]
        );
        const [newEvent] = await promisePool.query('SELECT * FROM Events WHERE event_id = ?', [result.insertId]);
        res.status(201).json({ success: true, message: 'Event created successfully', data: newEvent[0] });
    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({ success: false, message: 'Error creating event' });
    }
});

// DELETE an event (cascades to EventAssignments)
app.delete('/api/events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await promisePool.query('DELETE FROM Events WHERE event_id = ?', [id]);
        res.status(200).json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ success: false, message: 'Error deleting event' });
    }
});

// GET users assigned to an event
app.get('/api/events/:id/assignments', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query(
            'SELECT user_id FROM EventAssignments WHERE event_id = ?',
            [id]
        );
        res.status(200).json({ success: true, data: rows.map(r => r.user_id) });
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ success: false, message: 'Error fetching assignments' });
    }
});

// POST assign users to an event (replaces existing assignments + sends email)
app.post('/api/events/:id/assignments', async (req, res) => {
    const { id } = req.params;
    const { user_ids } = req.body; // array of user_ids

    if (!Array.isArray(user_ids)) {
        return res.status(400).json({ success: false, message: 'user_ids must be an array.' });
    }

    const connection = await promisePool.getConnection();
    try {
        // Fetch the event details
        const [eventRows] = await connection.query('SELECT * FROM Events WHERE event_id = ?', [id]);
        if (eventRows.length === 0) {
            connection.release();
            return res.status(404).json({ success: false, message: 'Event not found.' });
        }
        const event = eventRows[0];

        await connection.beginTransaction();

        // Replace all existing assignments for this event
        await connection.query('DELETE FROM EventAssignments WHERE event_id = ?', [id]);

        if (user_ids.length > 0) {
            const insertValues = user_ids.map(uid => [parseInt(id), uid]);
            await connection.query(
                'INSERT INTO EventAssignments (event_id, user_id) VALUES ?',
                [insertValues]
            );
        }

        await connection.commit();
        connection.release();

        // Send email notifications to all assigned users
        if (user_ids.length > 0) {
            const [personRows] = await promisePool.query(
                'SELECT full_name, email FROM Person WHERE user_id IN (?) AND email IS NOT NULL AND email != ""',
                [user_ids]
            );

            const startFormatted = new Date(event.start_time).toLocaleString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const endFormatted = event.end_time
                ? new Date(event.end_time).toLocaleString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                })
                : 'Open-ended';

            const emailPromises = personRows.map(person => {
                const mailOptions = {
                    from: `"GKAttendance" <${process.env.EMAIL_USER}>`,
                    to: person.email,
                    subject: `GKAttendance — You've been assigned to: ${event.title}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
                            <div style="text-align: center; margin-bottom: 24px;">
                                <h2 style="color: #3b82f6; margin: 0;">GKAttendance</h2>
                                <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Event Assignment Notification</p>
                            </div>
                            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 24px;" />
                            <p style="font-size: 16px; line-height: 1.5;">Hello <strong>${person.full_name}</strong>,</p>
                            <p style="font-size: 16px; line-height: 1.5;">You have been assigned to the following event:</p>

                            <div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                                <h3 style="margin: 0 0 12px 0; color: #0f172a; font-size: 1.2rem;">${event.title}</h3>
                                ${event.location ? `<p style="margin: 6px 0; color: #475569;"><strong>📍 Location:</strong> ${event.location}</p>` : ''}
                                <p style="margin: 6px 0; color: #475569;"><strong>🕐 Starts:</strong> ${startFormatted}</p>
                                <p style="margin: 6px 0; color: #475569;"><strong>🕐 Ends:</strong> ${endFormatted}</p>
                                ${event.description ? `<p style="margin: 12px 0 0 0; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 12px;"><strong>📋 Details:</strong> ${event.description}</p>` : ''}
                            </div>

                            <p style="font-size: 15px; color: #64748b; line-height: 1.5;">This event has been added to your schedule in the GKAttendance portal. You can view it under <strong>My Schedule</strong> when you log in.</p>
                            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                            <p style="font-size: 12px; color: #94a3b8; text-align: center;">This is an automated notification from GKAttendance. Please do not reply to this email.</p>
                        </div>
                    `
                };
                return transport.sendMail(mailOptions).catch(err => {
                    console.error(`Failed to send email to ${person.email}:`, err.message);
                });
            });

            await Promise.allSettled(emailPromises);
        }

        res.status(200).json({
            success: true,
            message: `Assignments saved. Emails sent to ${user_ids.length} user(s).`
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error saving assignments:', error);
        res.status(500).json({ success: false, message: 'Error saving assignments' });
    }
});

// GET events assigned to a specific user (for user dashboard calendar)
app.get('/api/user/:id/events', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await promisePool.query(`
            SELECT 
                e.event_id,
                e.title,
                e.location,
                e.description,
                e.start_time,
                e.end_time,
                e.created_at
            FROM Events e
            INNER JOIN EventAssignments ea ON e.event_id = ea.event_id
            WHERE ea.user_id = ?
            ORDER BY e.start_time ASC
        `, [id]);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching user events:', error);
        res.status(500).json({ success: false, message: 'Error fetching user events' });
    }
});

// Promote a user to Admin (copies user to Admins table)
app.post('/api/admin/promote/:id', async (req, res) => {
    const { id } = req.params;

    const connection = await promisePool.getConnection();
    try {
        const [userRows] = await connection.query('SELECT username, password, email FROM Person WHERE user_id = ?', [id]);
        if (userRows.length === 0) {
            connection.release();
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = userRows[0];

        if (!user.username || !user.password) {
            connection.release();
            return res.status(400).json({ success: false, message: 'User missing username or password, cannot be promoted' });
        }

        const [adminRows] = await connection.query('SELECT admin_id FROM Admins WHERE username = ?', [user.username]);
        if (adminRows.length > 0) {
            connection.release();
            return res.status(400).json({ success: false, message: 'User is already an admin' });
        }

        await connection.query('INSERT INTO Admins (username, password, email) VALUES (?, ?, ?)', [user.username, user.password, user.email]);

        connection.release();
        res.status(200).json({ success: true, message: 'User promoted to Admin successfully. Data and password transferred.' });
    } catch (error) {
        if (connection) connection.release();
        console.error('Error promoting user:', error);
        res.status(500).json({ success: false, message: 'Internal server error promoting user' });
    }
});

// Demote a user from Admin
app.post('/api/admin/demote/:id', async (req, res) => {
    const { id } = req.params;

    const connection = await promisePool.getConnection();
    try {
        const [userRows] = await connection.query('SELECT username FROM Person WHERE user_id = ?', [id]);
        if (userRows.length === 0) {
            connection.release();
            return res.status(404).json({ success: false, message: 'User not found in Person table' });
        }

        const username = userRows[0].username;

        await connection.query('DELETE FROM Admins WHERE username = ?', [username]);

        connection.release();
        res.status(200).json({ success: true, message: 'User demoted from Admin successfully.' });
    } catch (error) {
        if (connection) connection.release();
        console.error('Error demoting user:', error);
        res.status(500).json({ success: false, message: 'Internal server error demoting user' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`GKAttendance Backend running on http://localhost:${PORT}`);
});

//DEBIAN SMTP SLOW
