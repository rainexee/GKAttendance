const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');

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

// Convert pool to use promises
const promisePool = pool.promise();

// Database Seeding Logic
async function seedDatabase() {
    try {
        // Seed Roles
        const [roles] = await promisePool.query('SELECT COUNT(*) as count FROM Role');
        if (roles[0].count === 0) {
            console.log('Seeding default roles...');
            const defaultRoles = ['Student', 'Staff', 'Researcher', 'Professor'];
            for (const role of defaultRoles) {
                await promisePool.query('INSERT INTO Role (role_name) VALUES (?)', [role]);
            }
        }

        // Seed Labs
        const [labs] = await promisePool.query('SELECT COUNT(*) as count FROM GKLab');
        if (labs[0].count === 0) {
            console.log('Seeding default labs...');
            const defaultLabs = [
                { code: 'LAB-GRL', name: 'Goks Research Labs' },
                { code: 'LAB-AI', name: 'Artificial Intelligence Lab' },
                { code: 'LAB-SEC', name: 'Cybersecurity Lab' }
            ];
            for (const lab of defaultLabs) {
                await promisePool.query('INSERT INTO GKLab (lab_code, lab_name) VALUES (?, ?)', [lab.code, lab.name]);
            }
        }
        console.log('Database check/seeding complete.');
    } catch (err) {
        console.error('Error during database seeding:', err);
    }
}
seedDatabase();

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

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/adminDashboard.html'));
});

// Admin Login Endpoint
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Query the database for the admin
        // Note: In production, always compare hashed passwords (e.g., using bcrypt)
        const [rows] = await promisePool.query(
            'SELECT * FROM Admins WHERE username = ? AND password = ?',
            [username, password]
        );

        if (rows.length > 0) {
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

// Get all card scan logs (from Logging table)
app.get('/api/logs', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT 
                l.log_id,
                l.date_logged as timestamp,
                l.user_id,
                p.full_name,
                p.username,
                p.email,
                p.unique_id,
                r.role_name,
                gl.lab_name
            FROM Logging l
            LEFT JOIN Person p ON l.user_id = p.user_id
            LEFT JOIN Role r ON p.role_id = r.role_id
            LEFT JOIN GKLab gl ON p.lab_id = gl.lab_id
            ORDER BY l.date_logged DESC
        `);

        // Format the response to match what the frontend expects
        const formattedLogs = rows.map(log => ({
            logId: `LOG${String(log.log_id).padStart(3, '0')}`,
            personName: log.full_name || 'Unknown',
            cardUid: log.unique_id ? String(log.unique_id) : 'N/A',
            timestamp: log.timestamp,
            device: "Card Reader",
            userId: log.user_id,
            role: log.role_name,
            lab: log.lab_name
        }));

        res.status(200).json({
            success: true,
            data: formattedLogs
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching logs data'
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

        // 2. Insert into Person table
        const [result] = await connection.query(
            'INSERT INTO Person (full_name, username, email, password, lab_id, role_id, unique_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [full_name, username, email, password, lab_id || null, role_id || null, unique_id]
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

// Add a new log entry (for card scan)
app.post('/api/logs', async (req, res) => {
    const { user_id } = req.body;

    try {
        const [result] = await promisePool.query(
            'INSERT INTO Logging (user_id) VALUES (?)',
            [user_id]
        );

        res.status(201).json({
            success: true,
            message: 'Log entry created',
            logId: result.insertId
        });
    } catch (error) {
        console.error('Error creating log:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating log entry'
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
