const jwt = require('jsonwebtoken');

const adminMiddleware = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Admin access denied. No token provided.' });
  }

  const token = req.cookies?.adminToken || req.headers.authorization?.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden. Admin only.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Admin token expired.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid admin token.' });
  }
};

module.exports = adminMiddleware;
