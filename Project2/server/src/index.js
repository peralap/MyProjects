require('dotenv').config();

const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { requireAuth, requireRole } = require('./auth');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
}
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    throw new Error('DB_USER and DB_PASSWORD must be configured');
}

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/auth/register', async (req, res, next) => {
    const body = req.body || {};
    const { name, email, password, role, phone, serviceType, experienceYears, hourlyRate } = body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanName = typeof name === 'string' ? name.trim() : '';

    if (!cleanName || cleanName.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 ||
        !['customer', 'gigworker'].includes(role)) {
        return res.status(400).json({ error: 'Provide a name, valid email, password of at least 8 characters (maximum 72 UTF-8 bytes), and customer or gigworker role' });
    }
    if (role === 'gigworker' &&
        (typeof serviceType !== 'string' || !serviceType.trim() || serviceType.trim().length > 100 ||
         !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80 ||
         typeof hourlyRate !== 'number' || !Number.isFinite(hourlyRate) || hourlyRate <= 0 || hourlyRate > 1000000)) {
        return res.status(400).json({ error: 'Provide a service, valid experience, and positive hourly rate for worker registration' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const passwordHash = await bcrypt.hash(password, 12);
        const [userResult] = await connection.execute(
            'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
            [cleanName, normalizedEmail, passwordHash, role, typeof phone === 'string' ? phone.trim().slice(0, 15) : null]
        );

        if (role === 'gigworker') {
            await connection.execute(
                'INSERT INTO gig_workers (user_id, service_type, experience_years, hourly_rate) VALUES (?, ?, ?, ?)',
                [userResult.insertId, serviceType.trim(), experienceYears, hourlyRate]
            );
        }

        await connection.commit();
        return res.status(201).json({ message: 'Account created. Please sign in.' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }
        return next(error);
    } finally {
        connection.release();
    }
});

app.post('/api/auth/login', async (req, res, next) => {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    try {
        const [users] = await pool.execute(
            'SELECT id, password_hash, role FROM users WHERE email = ?',
            [email]
        );
        if (!users.length || !(await bcrypt.compare(password, users[0].password_hash))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];
        const token = jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
            subject: String(user.id),
            expiresIn: '2h'
        });
        return res.json({ token, user: { id: user.id, role: user.role } });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/workers', async (_req, res, next) => {
    try {
        const [workers] = await pool.execute(
            `SELECT gw.id, gw.service_type AS serviceType, gw.experience_years AS experienceYears,
                    gw.hourly_rate AS hourlyRate, u.name
             FROM gig_workers gw
             JOIN users u ON u.id = gw.user_id
             WHERE gw.status = 'available'
             ORDER BY gw.id DESC`
        );
        return res.json(workers);
    } catch (error) {
        return next(error);
    }
});

app.post('/api/bookings', requireAuth, requireRole('customer'), async (req, res, next) => {
    const body = req.body || {};
    const workerId = Number(body.workerId);
    const hours = Number(body.hours);
    if (!Number.isSafeInteger(workerId) || workerId < 1 ||
        !Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return res.status(400).json({ error: 'Provide a valid worker and booking duration (up to 24 hours)' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [workers] = await connection.execute(
            'SELECT id, hourly_rate FROM gig_workers WHERE id = ? AND status = "available" FOR UPDATE',
            [workerId]
        );
        if (!workers.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Available worker not found' });
        }

        const totalAmount = Math.round(workers[0].hourly_rate * hours * 100) / 100;
        const [booking] = await connection.execute(
            'INSERT INTO bookings (customer_id, worker_id, hours, total_amount) VALUES (?, ?, ?, ?)',
            [req.user.id, workerId, hours, totalAmount]
        );
        await connection.commit();
        return res.status(201).json({
            id: booking.insertId,
            hours,
            totalAmount,
            currency: 'INR',
            status: 'pending'
        });
    } catch (error) {
        await connection.rollback();
        return next(error);
    } finally {
        connection.release();
    }
});

app.get('/api/bookings/mine', requireAuth, requireRole('customer'), async (req, res, next) => {
    try {
        const [bookings] = await pool.execute(
            `SELECT b.id, b.booking_date AS bookingDate, b.status, b.total_amount AS totalAmount,
                    b.hours, u.name AS workerName, gw.service_type AS serviceType
             FROM bookings b
             JOIN gig_workers gw ON gw.id = b.worker_id
             JOIN users u ON u.id = gw.user_id
             WHERE b.customer_id = ?
             ORDER BY b.booking_date DESC`,
            [req.user.id]
        );
        return res.json(bookings);
    } catch (error) {
        return next(error);
    }
});

app.use((error, _req, res, _next) => {
    console.error(error);
    return res.status(500).json({ error: 'An unexpected server error occurred' });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`AtoZGigServices API listening on port ${port}`));
