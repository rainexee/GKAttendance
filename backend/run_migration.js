const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        multipleStatements: true
    });

    const sql = fs.readFileSync(path.join(__dirname, '../Schema/events_migration.sql'), 'utf8');
    try {
        await connection.query(sql);
        console.log('Migration successful');
    } catch (e) {
        console.error('Migration failed:', e);
    }
    await connection.end();
}
run();
