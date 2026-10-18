require('dotenv').config();
const http = require('node:http');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const {
  accountStatusSchema,
  interestSchema,
  loginSchema,
  paymentReviewSchema,
  planPriceSchema,
  profileSchema,
  registerSchema,
  responseSchema,
  searchSchema,
  subscriptionPaymentSchema,
} = require('./validation');

const port = Number(process.env.PORT || 5000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('Set JWT_SECRET to a random value at least 32 characters long in backend/.env.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'maitri_matrimony',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const app = express();
const server = http.createServer(app);
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:4200';
const io = new Server(server, { cors: { origin: webOrigin } });

app.use(helmet());
app.use(cors({ origin: webOrigin }));
app.use(express.json({ limit: '1mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait and try again.' },
});
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

function rejectInvalid(schema, value, res) {
  const result = schema.safeParse(value);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message || 'Invalid request.' });
    return null;
  }
  return result.data;
}

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
}

async function authenticateToken(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Sign in to continue.' });
  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  const [users] = await pool.execute(
    'SELECT id, email, account_status, role FROM users WHERE id = ? LIMIT 1',
    [payload.id],
  );
  const user = users[0];
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  if (user.account_status === 'Suspended') return res.status(403).json({ error: 'This account has been deactivated.' });
  req.user = { id: user.id, email: user.email, role: user.role, accountStatus: user.account_status };
  return next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
  return next();
}

async function requireActiveSubscription(req, res, next) {
  const [subscriptions] = await pool.execute(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'Active' AND ends_at > CURRENT_TIMESTAMP LIMIT 1",
    [req.user.id],
  );
  if (!subscriptions.length) {
    return res.status(402).json({ error: 'An active subscription is required to search and connect.', code: 'SUBSCRIPTION_REQUIRED' });
  }
  return next();
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required.'));
    socket.userId = jwt.verify(token, jwtSecret).id;
    return next();
  } catch {
    return next(new Error('Invalid session.'));
  }
});
io.on('connection', (socket) => socket.join(`user:${socket.userId}`));

app.get('/', (req, res) => res.redirect(webOrigin));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const value = rejectInvalid(registerSchema, req.body, res);
  if (!value) return;
  const passwordHash = await bcrypt.hash(value.password, 12);
  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash, phone) VALUES (?, ?, ?)',
      [value.email, passwordHash, value.phone],
    );
    const user = { id: result.insertId, email: value.email, accountStatus: 'Pending', role: 'user' };
    return res.status(201).json({ token: createToken(user), user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email or phone number is already registered.' });
    throw error;
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const value = rejectInvalid(loginSchema, req.body, res);
  if (!value) return;
  const [users] = await pool.execute(
    'SELECT id, email, password_hash, account_status, role FROM users WHERE email = ? LIMIT 1',
    [value.email.toLowerCase()],
  );
  const user = users[0];
  if (!user || !(await bcrypt.compare(value.password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  if (user.account_status === 'Suspended') return res.status(403).json({ error: 'This account is not available. Contact support for help.' });
  return res.json({ token: createToken(user), user: { id: user.id, email: user.email, accountStatus: user.account_status, role: user.role } });
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const [users] = await pool.execute(
    `SELECT u.id, u.email, u.phone, u.account_status, u.role, u.created_at,
       p.first_name, p.last_name, p.gender, p.date_of_birth,
       TIMESTAMPDIFF(YEAR, p.date_of_birth, CURRENT_DATE) AS age,
       p.height_cm, p.religion, p.caste_community, p.gothram, p.rasi,
       p.star_nakshatram, p.mother_tongue, p.native_district, p.current_city,
       p.education, p.profession, p.annual_income, p.family_details, p.bio,
       (p.photo_data IS NOT NULL) AS has_photo
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     ORDER BY u.created_at DESC, u.id DESC`,
  );
  return res.json(users);
});

app.patch('/api/admin/users/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const value = rejectInvalid(accountStatusSchema, req.body, res);
  if (!value) return;
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ error: 'Invalid user.' });
  if (userId === req.user.id) return res.status(409).json({ error: 'You cannot deactivate your own admin account.' });
  const [result] = await pool.execute('UPDATE users SET account_status = ? WHERE id = ?', [value.accountStatus, userId]);
  if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
  return res.json({ id: userId, accountStatus: value.accountStatus });
});

app.get('/api/subscription/plans', authenticateToken, async (req, res) => {
  const [plans] = await pool.execute(
    'SELECT id, duration_months, name, amount, currency FROM subscription_plans WHERE is_active = TRUE ORDER BY duration_months',
  );
  return res.json(plans);
});

app.get('/api/subscription/me', authenticateToken, async (req, res) => {
  const [subscriptions] = await pool.execute(
    `SELECT s.id, s.status, s.starts_at, s.ends_at, plan.duration_months, plan.name AS plan_name,
       payment.status AS payment_status, payment.amount, payment.currency,
       payment.transaction_reference, payment.created_at AS payment_created_at, payment.review_note
     FROM subscriptions s
     JOIN subscription_plans plan ON plan.id = s.plan_id
     JOIN payments payment ON payment.id = s.payment_id
     WHERE s.user_id = ? ORDER BY s.id DESC LIMIT 1`,
    [req.user.id],
  );
  return res.json(subscriptions[0] || null);
});

app.post('/api/subscription/payments', authenticateToken, async (req, res) => {
  const value = rejectInvalid(subscriptionPaymentSchema, req.body, res);
  if (!value) return;
  const [plans] = await pool.execute(
    'SELECT id, duration_months, amount, currency FROM subscription_plans WHERE id = ? AND is_active = TRUE LIMIT 1',
    [value.planId],
  );
  const plan = plans[0];
  if (!plan) return res.status(404).json({ error: 'Subscription plan not found.' });
  if (plan.amount === null) return res.status(409).json({ error: 'The price for this plan has not been set yet.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [pending] = await connection.execute(
      "SELECT id FROM payments WHERE user_id = ? AND status = 'Pending' LIMIT 1 FOR UPDATE",
      [req.user.id],
    );
    if (pending.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'A payment is already awaiting review.' });
    }
    const [paymentResult] = await connection.execute(
      'INSERT INTO payments (user_id, plan_id, amount, currency, transaction_reference) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, plan.id, plan.amount, plan.currency, value.transactionReference],
    );
    await connection.execute(
      'INSERT INTO subscriptions (user_id, plan_id, payment_id, status) VALUES (?, ?, ?, \'Pending\')',
      [req.user.id, plan.id, paymentResult.insertId],
    );
    await connection.commit();
    return res.status(201).json({ paymentId: paymentResult.insertId, status: 'Pending' });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That transaction reference has already been submitted.' });
    throw error;
  } finally {
    connection.release();
  }
});

app.get('/api/admin/subscription-plans', authenticateToken, requireAdmin, async (req, res) => {
  const [plans] = await pool.execute(
    'SELECT id, duration_months, name, amount, currency, is_active FROM subscription_plans ORDER BY duration_months',
  );
  return res.json(plans);
});

app.patch('/api/admin/subscription-plans/:id', authenticateToken, requireAdmin, async (req, res) => {
  const value = rejectInvalid(planPriceSchema, req.body, res);
  if (!value) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid subscription plan.' });
  const [result] = await pool.execute(
    'UPDATE subscription_plans SET amount = ?, currency = ? WHERE id = ?',
    [value.amount, value.currency, id],
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Subscription plan not found.' });
  return res.json({ id, amount: value.amount, currency: value.currency });
});

app.get('/api/admin/subscription-payments', authenticateToken, requireAdmin, async (req, res) => {
  const [payments] = await pool.execute(
    `SELECT payment.id, payment.user_id, user.email, user.phone,
       plan.name AS plan_name, plan.duration_months, payment.amount, payment.currency,
       payment.transaction_reference, payment.status, payment.created_at,
       payment.reviewed_at, payment.review_note
     FROM payments payment
     JOIN users user ON user.id = payment.user_id
     JOIN subscription_plans plan ON plan.id = payment.plan_id
     ORDER BY (payment.status = 'Pending') DESC, payment.created_at DESC`,
  );
  return res.json(payments);
});

app.patch('/api/admin/subscription-payments/:id', authenticateToken, requireAdmin, async (req, res) => {
  const value = rejectInvalid(paymentReviewSchema, req.body, res);
  if (!value) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid payment record.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [payments] = await connection.execute(
      `SELECT payment.id, payment.user_id, payment.status, plan.duration_months
       FROM payments payment JOIN subscription_plans plan ON plan.id = payment.plan_id
       WHERE payment.id = ? FOR UPDATE`,
      [id],
    );
    const payment = payments[0];
    if (!payment) {
      await connection.rollback();
      return res.status(404).json({ error: 'Payment record not found.' });
    }
    if (payment.status !== 'Pending') {
      await connection.rollback();
      return res.status(409).json({ error: 'This payment has already been reviewed.' });
    }
    await connection.execute(
      'UPDATE payments SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?, review_note = ? WHERE id = ?',
      [value.status, req.user.id, value.reviewNote ?? null, id],
    );
    if (value.status === 'Approved') {
      const [active] = await connection.execute(
        "SELECT ends_at FROM subscriptions WHERE user_id = ? AND status = 'Active' AND ends_at > CURRENT_TIMESTAMP ORDER BY ends_at DESC LIMIT 1 FOR UPDATE",
        [payment.user_id],
      );
      const startsAt = active[0]?.ends_at || new Date();
      await connection.execute(
        `UPDATE subscriptions SET status = 'Active', starts_at = ?,
           ends_at = DATE_ADD(?, INTERVAL ? MONTH) WHERE payment_id = ?`,
        [startsAt, startsAt, payment.duration_months, id],
      );
    } else {
      await connection.execute("UPDATE subscriptions SET status = 'Rejected' WHERE payment_id = ?", [id]);
    }
    await connection.commit();
    return res.json({ id, status: value.status });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.get('/api/profiles/me', authenticateToken, async (req, res) => {
  const [profiles] = await pool.execute(
    `SELECT id, user_id, first_name, last_name, gender, date_of_birth, height_cm, religion,
       caste_community, gothram, rasi, star_nakshatram, mother_tongue, native_district,
       current_city, education, profession, annual_income, family_details, profile_photo_url,
       bio, (photo_data IS NOT NULL) AS has_photo
     FROM profiles WHERE user_id = ? LIMIT 1`,
    [req.user.id],
  );
  if (!profiles[0]) return res.json(null);
  return res.json(profiles[0]);
});

app.put('/api/profiles/me', authenticateToken, async (req, res) => {
  const value = rejectInvalid(profileSchema, req.body, res);
  if (!value) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const columns = [
      'first_name', 'last_name', 'gender', 'date_of_birth', 'height_cm', 'religion',
      'caste_community', 'gothram', 'rasi', 'star_nakshatram', 'mother_tongue',
      'native_district', 'current_city', 'education', 'profession', 'annual_income',
      'family_details', 'profile_photo_url', 'bio',
    ];
    const updates = columns.map((column) => `${column} = VALUES(${column})`).join(', ');
    await connection.execute(
      `INSERT INTO profiles (user_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updates}`,
      [req.user.id, ...columns.map((column) => value[column] ?? null)],
    );
    await connection.execute("UPDATE users SET account_status = 'Active' WHERE id = ?", [req.user.id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const [profiles] = await pool.execute('SELECT * FROM profiles WHERE user_id = ? LIMIT 1', [req.user.id]);
  const { photo_data: photoData, photo_mime: photoMime, ...profile } = profiles[0];
  return res.json({ ...profile, has_photo: Boolean(photoData) });
});

app.post('/api/profiles/me/photo', authenticateToken, photoUpload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a photo to upload.' });
  const bytes = req.file.buffer;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const mime = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : null;
  if (!mime) return res.status(415).json({ error: 'Use a JPEG, PNG, or WebP image.' });
  const [result] = await pool.execute(
    'UPDATE profiles SET photo_data = ?, photo_mime = ?, profile_photo_url = NULL WHERE user_id = ?',
    [bytes, mime, req.user.id],
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Save your profile before adding a photo.' });
  return res.status(201).json({ has_photo: true });
});

app.get('/api/profiles/:userId/photo', authenticateToken, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(400).json({ error: 'Invalid profile.' });
  const [profiles] = await pool.execute(
    `SELECT p.photo_data, p.photo_mime FROM profiles p
     JOIN users u ON u.id = p.user_id WHERE p.user_id = ? AND u.account_status = 'Active' LIMIT 1`,
    [userId],
  );
  if (!profiles[0]?.photo_data) return res.sendStatus(404);
  res.set({ 'Content-Type': profiles[0].photo_mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  return res.send(profiles[0].photo_data);
});

app.get('/api/profiles/search', authenticateToken, requireActiveSubscription, async (req, res) => {
  const filters = rejectInvalid(searchSchema, req.query, res);
  if (!filters) return;
  const [ownProfiles] = await pool.execute('SELECT caste_community FROM profiles WHERE user_id = ? LIMIT 1', [req.user.id]);
  const community = ownProfiles[0]?.caste_community?.trim();
  if (!community) {
    return res.status(409).json({ error: 'Add your community to your profile before searching for same-community matches.', code: 'COMMUNITY_REQUIRED' });
  }
  const page = filters.page || 1;
  const clauses = ["u.account_status = 'Active'", 'p.user_id <> ?', 'p.caste_community = ?'];
  const params = [req.user.id, community];
  const addLike = (column, value) => {
    if (value) { clauses.push(`p.${column} LIKE ?`); params.push(`%${value}%`); }
  };
  if (filters.gender) { clauses.push('p.gender = ?'); params.push(filters.gender); }
  if (filters.region) { clauses.push('p.native_district LIKE ?'); params.push(`%${filters.region}%`); }
  if (filters.minAge !== undefined) { clauses.push('TIMESTAMPDIFF(YEAR, p.date_of_birth, CURRENT_DATE) >= ?'); params.push(filters.minAge); }
  if (filters.maxAge !== undefined) { clauses.push('TIMESTAMPDIFF(YEAR, p.date_of_birth, CURRENT_DATE) <= ?'); params.push(filters.maxAge); }
  if (filters.minHeight !== undefined) { clauses.push('p.height_cm >= ?'); params.push(filters.minHeight); }
  if (filters.maxHeight !== undefined) { clauses.push('p.height_cm <= ?'); params.push(filters.maxHeight); }
  addLike('education', filters.education);
  addLike('profession', filters.profession);
  addLike('star_nakshatram', filters.star);
  addLike('rasi', filters.rasi);
  const joinAndWhere = `FROM profiles p JOIN users u ON u.id = p.user_id WHERE ${clauses.join(' AND ')}`;
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total ${joinAndWhere}`, params);
  const [profiles] = await pool.execute(
    `SELECT p.id, p.user_id, p.first_name, p.last_name, p.gender, p.date_of_birth,
       p.height_cm, p.religion, p.caste_community, p.gothram, p.rasi, p.star_nakshatram,
       p.mother_tongue, p.native_district, p.current_city, p.education, p.profession,
       p.profile_photo_url, p.bio, (p.photo_data IS NOT NULL) AS has_photo
     ${joinAndWhere} ORDER BY p.updated_at DESC LIMIT 5 OFFSET ?`,
    [...params, (page - 1) * 5],
  );
  return res.json({ profiles, total: countRows[0].total, page, pageSize: 5 });
});

app.get('/api/interests', authenticateToken, requireActiveSubscription, async (req, res) => {
  const [items] = await pool.execute(
    `SELECT c.id, c.sender_id, c.receiver_id, c.status, p.first_name, p.last_name,
       p.native_district, p.profession, 'incoming' AS direction
     FROM connections c JOIN profiles p ON p.user_id = c.sender_id WHERE c.receiver_id = ?
     UNION ALL
     SELECT c.id, c.sender_id, c.receiver_id, c.status, p.first_name, p.last_name,
       p.native_district, p.profession, 'outgoing' AS direction
     FROM connections c JOIN profiles p ON p.user_id = c.receiver_id WHERE c.sender_id = ?
     ORDER BY id DESC LIMIT 100`,
    [req.user.id, req.user.id],
  );
  return res.json(items);
});

app.post('/api/interests', authenticateToken, requireActiveSubscription, async (req, res) => {
  const value = rejectInvalid(interestSchema, req.body, res);
  if (!value) return;
  if (value.receiverUserId === req.user.id) return res.status(400).json({ error: 'You cannot express interest in your own profile.' });
  const [profiles] = await pool.execute(
    `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
     WHERE p.user_id IN (?, ?) AND u.account_status = 'Active'`,
    [req.user.id, value.receiverUserId],
  );
  if (profiles.length !== 2) return res.status(404).json({ error: 'That profile is not available.' });
  try {
    const [result] = await pool.execute('INSERT INTO connections (sender_id, receiver_id) VALUES (?, ?)', [req.user.id, value.receiverUserId]);
    io.to(`user:${value.receiverUserId}`).emit('interest:new', { id: result.insertId });
    return res.status(201).json({ id: result.insertId, status: 'Requested' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An interest between you is already on record.' });
    throw error;
  }
});

app.patch('/api/interests/:id', authenticateToken, requireActiveSubscription, async (req, res) => {
  const value = rejectInvalid(responseSchema, req.body, res);
  if (!value) return;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid interest.' });
  const [result] = await pool.execute(
    "UPDATE connections SET status = ? WHERE id = ? AND receiver_id = ? AND status = 'Requested'",
    [value.status, id, req.user.id],
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Interest not found or already answered.' });
  const [rows] = await pool.execute('SELECT sender_id FROM connections WHERE id = ?', [id]);
  io.to(`user:${rows[0].sender_id}`).emit('interest:updated', { id, status: value.status });
  return res.json({ id, status: value.status });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ error: 'Request body must be valid JSON.' });
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photos must be 2 MB or smaller.' });
  console.error(error.message);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

server.listen(port, () => console.log(`Maitri API listening on http://localhost:${port}`));
async function shutdown() {
  server.close();
  await pool.end();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
