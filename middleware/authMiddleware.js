import { verifyToken, signToken } from '../utils/tokenUtil.js';

export const generateToken = (id, role = 'customer', email = '') => {
  return signToken({ id: String(id), role, email });
};

export const protect = (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = verifyToken(token);
      if (!decoded || !decoded.id) {
        return res.status(401).json({ message: 'Not authorized, token invalid or expired' });
      }
      req.user = decoded;
      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token verification failed' });
    }
  }

  return res.status(401).json({ message: 'Not authorized, no token provided' });
};

export const optionalProtect = (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = verifyToken(token);
      if (decoded && decoded.id) {
        req.user = decoded;
      }
    } catch (error) {}
  }
  return next();
};

export const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Forbidden, administrator access only' });
};
