const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { pool, getUserByUsername } = require('./database');
const bcrypt = require('bcrypt');

require('dotenv').config();

// Passport Local Strategy for username/password authentication
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await getUserByUsername(username);
      if (!user) return done(null, false, { message: 'User not found. Please check your username.' });

      const isMatch = await bcrypt.compare(password, user.password); // Use bcrypt to compare

      if (!isMatch) return done(null, false, { message: 'Invalid password. Please try again.' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

const logout = (req, res) => {
  // Here you can handle any necessary cleanup on the server side if needed
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = {
  passport,
  logout, // Ensure logout is included in the exports
};
