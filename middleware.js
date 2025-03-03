const authenticateToken = (req, res, next) => {
  if (!req.user) {
    return res.status(401).render('error', { message: "User is not authenticated" });
  }
  next();
};

const isAdmin = (req, res, next) => {
    if (req.user.role === 'admin') {
      next(); // Allow access for admin
    } else {
      res.status(403).render('error', { message: 'Access denied: Admin role required' });
    }
};

const isUser = (req, res, next) => {
    if (req.user.role === 'user' || req.user.role === 'admin') {
      next(); // Allow access for both user and admin
    } else {
      res.status(403).render('error', { message: 'Access denied: User role required' });
    }
};

module.exports = { isAdmin, isUser, authenticateToken };
