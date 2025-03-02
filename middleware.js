const isAdmin = (req, res, next) => {
    if (req.user.role === 'admin') {
      next(); // Allow access for admin
    } else {
      res.status(403).json({ error: 'Access denied: Admin role required' });
    }
  };
  
  const isUser = (req, res, next) => {
    if (req.user.role === 'user' || req.user.role === 'admin') {
      next(); // Allow access for both user and admin
    } else {
      res.status(403).json({ error: 'Access denied: User role required' });
    }
  };
  
  module.exports = { isAdmin, isUser };