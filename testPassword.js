const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});


const testPassword = async () => {
  console.log('Testing password verification...');
  const password = 'admin123';
  const hashedPassword = '$2a$06$fz1WvaQGW0lY25YatwbKM.PanBSqmes6zZXv0vIp1LL3WoBju9IJW';
  const isMatch = await pool.query('SELECT crypt($1, password) AS isMatch FROM users WHERE username = $2', [password, 'admin']);
    console.log('Password match result:', isMatch.rows[0].isMatch);

};

testPassword().catch(err => console.error(err));
