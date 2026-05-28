const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // Change this to your MySQL username
    password: '', // Change this to your MySQL password
    database: 'gkattendance_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Convert pool to use promises
const promisePool = pool.promise();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'GKAttendance API is running' });
});

app.get('/', (req,res) => {

});

// Admin Login Endpoint
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Query the database for the user
        // Note: In production, always compare hashed passwords (e.g., using bcrypt)
        const [rows] = await promisePool.query(
            'SELECT * FROM admins WHERE username = ? AND password = ?',
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

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 GKAttendance Backend running on http://localhost:${PORT}`);
});
