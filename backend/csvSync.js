const fs = require('fs');
const path = require('path');

/**
 * Robust RFC 4180-compliant CSV parser
 * Handles quotes, commas inside fields, escaped quotes (""), CRLF/LF line endings, and BOM.
 */
function parseCSV(text) {
    if (!text || typeof text !== 'string') return [];

    // Strip UTF-8 BOM if present
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }

    const lines = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (insideQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // Escaped double quotes
                    currentField += '"';
                    i++;
                } else {
                    insideQuotes = false;
                }
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                insideQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (char === '\r') {
                if (nextChar === '\n') {
                    i++;
                }
                currentRow.push(currentField.trim());
                currentField = '';
                if (currentRow.some(c => c.length > 0)) {
                    lines.push(currentRow);
                }
                currentRow = [];
            } else if (char === '\n') {
                currentRow.push(currentField.trim());
                currentField = '';
                if (currentRow.some(c => c.length > 0)) {
                    lines.push(currentRow);
                }
                currentRow = [];
            } else {
                currentField += char;
            }
        }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(c => c.length > 0)) {
            lines.push(currentRow);
        }
    }

    if (lines.length === 0) return [];

    // Map column headers flexibly
    const rawHeaders = lines[0];
    const headerMap = {};
    rawHeaders.forEach((h, idx) => {
        const clean = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (['dlsuidnumber', 'dlsuid', 'idnumber', 'idnum', 'studentid', 'id'].includes(clean)) {
            headerMap.dlsu_idnumber = idx;
        } else if (['fullname', 'name', 'personname', 'userfullname'].includes(clean)) {
            headerMap.full_name = idx;
        } else if (['username', 'user', 'uname'].includes(clean)) {
            headerMap.username = idx;
        } else if (['email', 'emailaddress', 'mail'].includes(clean)) {
            headerMap.email = idx;
        } else if (['uniqueid', 'carduid', 'cardid', 'rfid', 'rfiduid', 'rfidcard', 'card', 'uid'].includes(clean)) {
            headerMap.unique_id = idx;
        } else if (['role', 'rolename', 'roleid'].includes(clean)) {
            headerMap.role = idx;
        } else if (['lab', 'labname', 'labcode', 'labid', 'labgroup'].includes(clean)) {
            headerMap.lab = idx;
        } else if (['password', 'pass', 'pwd'].includes(clean)) {
            headerMap.password = idx;
        }
    });

    const parsedRows = [];
    for (let r = 1; r < lines.length; r++) {
        const row = lines[r];
        if (!row.some(cell => cell && cell.length > 0)) continue; // skip entirely empty rows

        const obj = {
            dlsu_idnumber: headerMap.dlsu_idnumber !== undefined ? row[headerMap.dlsu_idnumber] || '' : '',
            full_name: headerMap.full_name !== undefined ? row[headerMap.full_name] || '' : '',
            username: headerMap.username !== undefined ? row[headerMap.username] || '' : '',
            email: headerMap.email !== undefined ? row[headerMap.email] || '' : '',
            unique_id: headerMap.unique_id !== undefined ? row[headerMap.unique_id] || '' : '',
            role: headerMap.role !== undefined ? row[headerMap.role] || '' : '',
            lab: headerMap.lab !== undefined ? row[headerMap.lab] || '' : '',
            password: headerMap.password !== undefined ? row[headerMap.password] || '' : '',
            _rowIndex: r + 1
        };
        parsedRows.push(obj);
    }

    return parsedRows;
}

/**
 * Helper to escape a single CSV field
 */
function escapeCSVField(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Generate CSV string from person records
 */
function generateCSV(persons) {
    const headers = ['dlsu_idnumber', 'full_name', 'username', 'email', 'role', 'lab'];
    const lines = [headers.join(',')];

    for (const p of persons) {
        const row = [
            escapeCSVField(p.dlsu_idnumber || ''),
            escapeCSVField(p.full_name || ''),
            escapeCSVField(p.username || ''),
            escapeCSVField(p.email || ''),
            escapeCSVField(p.role_name || p.role || ''),
            escapeCSVField(p.lab_code || p.lab_name || p.lab || '')
        ];
        lines.push(row.join(','));
    }

    return lines.join('\r\n') + '\r\n';
}

/**
 * Generate sample template CSV string
 */
function generateTemplateCSV() {
    const headers = ['dlsu_idnumber', 'full_name', 'username', 'email', 'role', 'lab'];
    const sampleRows = [
        ['12208127', 'Jericho Raymund', 'Jericho Lirio', 'jericho_lirio@dlsu.edu.ph', 'Student', 'Cite4D'],
        ['12200972', 'Ino Rafael', 'Ino', 'Ino_Rafel@dlsu.edu.ph', 'Student', 'Cite4D'],
        ['12100001', 'Juan Dela Cruz', 'juan_delacruz', 'juan.delacruz@dlsu.edu.ph', 'Researcher', 'CeLT']
    ];

    const lines = [headers.join(',')];
    for (const row of sampleRows) {
        lines.push(row.map(escapeCSVField).join(','));
    }
    return lines.join('\r\n') + '\r\n';
}

/**
 * Query registered users from database
 */
async function getPersonsList(pool) {
    const [rows] = await pool.query(`
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
        ORDER BY p.user_id ASC
    `);
    return rows;
}

/**
 * Export current database registered users to a CSV file
 */
async function exportUsersToCSVFile(pool, filePath) {
    const persons = await getPersonsList(pool);
    const csvContent = generateCSV(persons);
    try {
        fs.writeFileSync(filePath, csvContent, 'utf8');
    } catch (err) {
        if (err.code === 'EBUSY') {
            console.warn(`[CSV Sync] Notice: ${path.basename(filePath)} is currently open in another program (e.g. Excel). Changes will sync once closed.`);
        } else {
            throw err;
        }
    }
    return { count: persons.length, filePath };
}

/**
 * Core sync logic: upserts user rows into ID and Person tables
 */
async function syncUsersFromRows(parsedRows, pool, hashPasswordFn) {
    if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
        return {
            success: true,
            totalRows: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: []
        };
    }

    // 1. Fetch available roles & labs for fast in-memory matching
    const [roles] = await pool.query('SELECT role_id, role_name FROM Role');
    const [labs] = await pool.query('SELECT lab_id, lab_code, lab_name FROM GKLab');

    const roleMap = new Map();
    for (const r of roles) {
        roleMap.set(String(r.role_id), r.role_id);
        roleMap.set(r.role_name.toLowerCase(), r.role_id);
    }

    const labMap = new Map();
    for (const l of labs) {
        labMap.set(String(l.lab_id), l.lab_id);
        if (l.lab_code) labMap.set(l.lab_code.toLowerCase(), l.lab_id);
        if (l.lab_name) labMap.set(l.lab_name.toLowerCase(), l.lab_id);
    }

    const defaultRoleId = roles.length > 0 ? roles[0].role_id : 1;
    const defaultLabId = labs.length > 0 ? labs[0].lab_id : 1;

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Process each row
    for (const row of parsedRows) {
        const rowNum = row._rowIndex || '?';
        const rawDlsuId = String(row.dlsu_idnumber || '').trim();
        const rawCardUid = String(row.unique_id || '').trim();
        let fullName = String(row.full_name || '').trim();
        let username = String(row.username || '').trim();
        let email = String(row.email || '').trim();
        const rawRole = String(row.role || '').trim();
        const rawLab = String(row.lab || '').trim();
        const plainPassword = String(row.password || '').trim();

        // Basic validation
        const parsedDlsuId = parseInt(rawDlsuId, 10);
        if (!rawDlsuId || isNaN(parsedDlsuId) || parsedDlsuId <= 0) {
            errors.push({ row: rowNum, error: `Invalid or missing DLSU ID number: "${rawDlsuId}"` });
            skippedCount++;
            continue;
        }

        // Auto-generate defaults if fields are empty
        if (!username) {
            username = email ? email.split('@')[0] : `user_${parsedDlsuId}`;
        }
        if (!email) {
            email = `${username.replace(/\s+/g, '').toLowerCase()}@dlsu.edu.ph`;
        }
        if (!fullName) {
            fullName = username;
        }

        // Match Role
        let roleId = defaultRoleId;
        if (rawRole) {
            const matchedRole = roleMap.get(rawRole.toLowerCase());
            if (matchedRole) roleId = matchedRole;
        }

        // Match Lab
        let labId = defaultLabId;
        if (rawLab) {
            const matchedLab = labMap.get(rawLab.toLowerCase());
            if (matchedLab) labId = matchedLab;
        }

        // Acquire connection for transactional upsert
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Find existing Person matching DLSU ID, email, username, or card UID (if card provided)
            let searchSql = `
                SELECT p.*, i.dlsu_idnumber
                FROM Person p
                LEFT JOIN ID i ON p.unique_id = i.unique_id
                WHERE i.dlsu_idnumber = ? OR p.email = ? OR p.username = ?
            `;
            const searchParams = [parsedDlsuId, email, username];
            if (rawCardUid) {
                searchSql += ` OR p.unique_id = ?`;
                searchParams.push(rawCardUid);
            }

            const [existingPersons] = await connection.query(searchSql, searchParams);

            let existingPerson = null;
            if (existingPersons.length > 0) {
                // Prioritize match on DLSU ID, then email, then username, then unique_id
                existingPerson = existingPersons.find(p => p.dlsu_idnumber === parsedDlsuId)
                    || existingPersons.find(p => p.email === email)
                    || existingPersons.find(p => p.username === username)
                    || existingPersons[0];
            }

            if (existingPerson) {
                // --- UPDATE EXISTING USER ---
                const targetUserId = existingPerson.user_id;

                // Check if new email or username is already used by someone else
                const [conflictUsers] = await connection.query(`
                    SELECT user_id, username, email FROM Person
                    WHERE (username = ? OR email = ?) AND user_id != ?
                `, [username, email, targetUserId]);

                if (conflictUsers.length > 0) {
                    const isDupUser = conflictUsers.some(u => u.username === username);
                    throw new Error(isDupUser
                        ? `Username "${username}" is already taken by user ID ${conflictUsers[0].user_id}`
                        : `Email "${email}" is already used by user ID ${conflictUsers[0].user_id}`);
                }

                // If card UID provided and different from existing, update card in ID table
                let finalCardUid = existingPerson.unique_id;
                if (rawCardUid && rawCardUid !== existingPerson.unique_id) {
                    const [existingIdRows] = await connection.query('SELECT * FROM ID WHERE unique_id = ?', [rawCardUid]);
                    if (existingIdRows.length > 0) {
                        await connection.query('UPDATE ID SET dlsu_idnumber = ? WHERE unique_id = ?', [parsedDlsuId, rawCardUid]);
                    } else {
                        await connection.query('INSERT INTO ID (unique_id, dlsu_idnumber) VALUES (?, ?)', [rawCardUid, parsedDlsuId]);
                    }
                    finalCardUid = rawCardUid;
                } else if (!finalCardUid) {
                    const [existingIdRow] = await connection.query('SELECT * FROM ID WHERE dlsu_idnumber = ?', [parsedDlsuId]);
                    if (existingIdRow.length > 0) {
                        finalCardUid = existingIdRow[0].unique_id;
                    } else {
                        const placeholderUid = `PENDING_${parsedDlsuId}`;
                        await connection.query('INSERT INTO ID (unique_id, dlsu_idnumber) VALUES (?, ?)', [placeholderUid, parsedDlsuId]);
                        finalCardUid = placeholderUid;
                    }
                } else {
                    await connection.query('UPDATE ID SET dlsu_idnumber = ? WHERE unique_id = ?', [parsedDlsuId, finalCardUid]);
                }

                // If password was explicitly supplied in CSV, update it; otherwise preserve current password
                if (plainPassword) {
                    const hashedPw = await hashPasswordFn(plainPassword);
                    await connection.query(`
                        UPDATE Person
                        SET full_name = ?, username = ?, email = ?, password = ?, lab_id = ?, role_id = ?, unique_id = ?
                        WHERE user_id = ?
                    `, [fullName, username, email, hashedPw, labId, roleId, finalCardUid, targetUserId]);
                } else {
                    await connection.query(`
                        UPDATE Person
                        SET full_name = ?, username = ?, email = ?, lab_id = ?, role_id = ?, unique_id = ?
                        WHERE user_id = ?
                    `, [fullName, username, email, labId, roleId, finalCardUid, targetUserId]);
                }

                await connection.commit();
                updatedCount++;

            } else {
                // --- INSERT NEW USER ---
                // Check if username or email already registered
                const [dupUsers] = await connection.query(
                    'SELECT user_id FROM Person WHERE username = ? OR email = ?',
                    [username, email]
                );
                if (dupUsers.length > 0) {
                    throw new Error(`Username "${username}" or Email "${email}" is already registered`);
                }

                let finalCardUid = null;
                if (rawCardUid) {
                    const [existingCard] = await connection.query('SELECT * FROM ID WHERE unique_id = ?', [rawCardUid]);
                    if (existingCard.length > 0) {
                        const [cardUser] = await connection.query('SELECT user_id, full_name FROM Person WHERE unique_id = ?', [rawCardUid]);
                        if (cardUser.length > 0) {
                            throw new Error(`Card UID "${rawCardUid}" is already assigned to "${cardUser[0].full_name}" (User ID ${cardUser[0].user_id})`);
                        }
                        await connection.query('UPDATE ID SET dlsu_idnumber = ? WHERE unique_id = ?', [parsedDlsuId, rawCardUid]);
                    } else {
                        await connection.query('INSERT INTO ID (unique_id, dlsu_idnumber) VALUES (?, ?)', [rawCardUid, parsedDlsuId]);
                    }
                    finalCardUid = rawCardUid;
                } else {
                    // Check if ID table already has this dlsu_idnumber
                    const [existingIdRow] = await connection.query('SELECT * FROM ID WHERE dlsu_idnumber = ?', [parsedDlsuId]);
                    if (existingIdRow.length > 0) {
                        finalCardUid = existingIdRow[0].unique_id;
                    } else {
                        const placeholderUid = `PENDING_${parsedDlsuId}`;
                        await connection.query('INSERT INTO ID (unique_id, dlsu_idnumber) VALUES (?, ?)', [placeholderUid, parsedDlsuId]);
                        finalCardUid = placeholderUid;
                    }
                }

                // Default password to their DLSU ID number (e.g. 12208127), and task them to change it on login
                const defaultPassword = plainPassword || String(parsedDlsuId);
                const hashedPassword = await hashPasswordFn(defaultPassword);
                const mustChange = 1; // Tasked to log in and change it!

                await connection.query(`
                    INSERT INTO Person (full_name, username, email, password, lab_id, role_id, unique_id, must_change_password)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [fullName, username, email, hashedPassword, labId, roleId, finalCardUid, mustChange]);

                await connection.commit();
                createdCount++;
            }
        } catch (err) {
            await connection.rollback();
            errors.push({ row: rowNum, dlsu_idnumber: parsedDlsuId, error: err.message });
            skippedCount++;
        } finally {
            connection.release();
        }
    }

    return {
        success: true,
        totalRows: parsedRows.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors
    };
}

/**
 * Synchronize database from a local CSV file
 */
async function syncFromFile(filePath, pool, hashPasswordFn) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`CSV file not found at: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const parsedRows = parseCSV(content);

    if (parsedRows.length === 0) {
        return {
            success: true,
            message: 'CSV file is empty or has only headers',
            totalRows: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: []
        };
    }

    return await syncUsersFromRows(parsedRows, pool, hashPasswordFn);
}

/**
 * File watcher setup to automatically sync whenever users.csv is saved
 */
function startCsvWatcher(filePath, pool, hashPasswordFn, onSync) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    let debounceTimer = null;
    let isInternalWriting = false;

    const watcher = fs.watch(filePath, (eventType) => {
        if (eventType !== 'change') return;
        if (isInternalWriting) return;

        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {
            try {
                console.log(`[CSV Watcher] Detected modification in ${path.basename(filePath)}. Auto-syncing users...`);
                const result = await syncFromFile(filePath, pool, hashPasswordFn);
                console.log(`[CSV Watcher] Sync completed: ${result.created} added, ${result.updated} updated, ${result.errors.length} errors.`);
                if (typeof onSync === 'function') {
                    onSync(result);
                }
            } catch (err) {
                console.error('[CSV Watcher] Error during auto-sync:', err.message);
            }
        }, 800);
    });

    return {
        watcher,
        setInternalWriting: (val) => {
            isInternalWriting = val;
        }
    };
}

module.exports = {
    parseCSV,
    generateCSV,
    generateTemplateCSV,
    getPersonsList,
    exportUsersToCSVFile,
    syncUsersFromRows,
    syncFromFile,
    startCsvWatcher
};
