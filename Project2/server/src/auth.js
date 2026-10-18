const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const header = req.get('authorization');
    const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const id = Number(payload.sub);
        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = { id, role: payload.role };
        return next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        return next();
    };
}

module.exports = { requireAuth, requireRole };
