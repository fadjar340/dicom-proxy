const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// User-related functions
const getUsers = async () => {
  try {
    const { rows } = await pool.query('SELECT * FROM users');
    return rows;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};

const addUser = async (user) => {
  const { username, password, role } = user;
  const hashedPassword = `crypt('${password}', gen_salt('bf'))`; // Use PostgreSQL's crypt function
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, role]
    );
    return rows[0];
  } catch (error) {
    console.error('Error adding user:', error);
    throw error;
  }
};

const updateUserRole = async (username, newRole) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
      [newRole, username]
    );
    return rowCount;
  } catch (error) {
    console.error('Error updating user role:', error);
    throw error;
  }
};

const deleteUser = async (username) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE username = $1', [username]);
    return rowCount;
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};

//const updateUser = async (user) => {
//  const { username, password, role } = user;
//  const hashedPassword = bcrypt.hashSync(password, 10);
//  const { rows } = await pool.query(
//    'update users SET username = $1, password = $2, role = $3 WHERE username = $1RETURNING *',
//    [username, hashedPassword, role]
//  );
//  return rows[0];
//};

const getUserByUsername = async (username) => {
  console.log(`Fetching user by username: ${username}`);
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (rows.length === 0) {
      console.error(`No user found with username: ${username}`);
      throw new Error(`User not found: ${username}`);
    }
    return rows[0];
  } catch (error) {
    console.error('Error fetching user by username:', error);
    throw new Error('Database query failed. Please try again later.');
  }
};

// AE Title-related functions
const getAETitles = async () => {
  try {
    const { rows } = await pool.query('SELECT * FROM ae_titles');
    return rows;
  } catch (error) {
    console.error('Error fetching AE Titles:', error);
    throw error;
  }
};

const addAETitle = async (aeTitle) => {
  const { name, host, port, aeTitle: aeTitleValue, remoteAETitle } = aeTitle;
  try {
    const { rows } = await pool.query(
      'INSERT INTO ae_titles (name, host, port, aeTitle, remoteAETitle) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, host, port, aeTitleValue, remoteAETitle]
    );
    return rows[0];
  } catch (error) {
    console.error('Error adding AE Title:', error);
    throw error;
  }
};

const updateAETitle = async (name, aeTitle) => {
  const { host, port, aeTitle: aeTitleValue, remoteAETitle } = aeTitle;
  try {
    const { rowCount } = await pool.query(
      'UPDATE ae_titles SET host = $1, port = $2, aeTitle = $3, remoteAETitle = $4, updated_at = CURRENT_TIMESTAMP WHERE name = $5',
      [host, port, aeTitleValue, remoteAETitle, name]
    );
    return rowCount;
  } catch (error) {
    console.error('Error updating AE Title:', error);
    throw error;
  }
};

const deleteAETitle = async (name) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM ae_titles WHERE name = $1', [name]);
    return rowCount;
  } catch (error) {
    console.error('Error deleting AE Title:', error);
    throw error;
  }
};

// Logging functions
const logWadoRequest = async (studyUID, seriesUID, objectUID, aeTitle) => {
  try {
    await pool.query(
      'INSERT INTO wado_requests (study_uid, series_uid, object_uid, ae_title) VALUES ($1, $2, $3, $4)',
      [studyUID, seriesUID, objectUID, aeTitle]
    );
  } catch (error) {
    console.error('Error logging WADO request:', error);
    throw error;
  }
};

const logQidoRequest = async (studyUID, accessionNumber, aeTitle) => {
  try {
    await pool.query(
      'INSERT INTO qido_requests (study_uid, accession_number, ae_title) VALUES ($1, $2, $3)',
      [studyUID, accessionNumber, aeTitle]
    );
  } catch (error) {
    console.error('Error logging QIDO request:', error);
    throw error;
  }
};

const logStowRequest = async (studyUID, seriesUID, objectUID, aeTitle) => {
  try {
    await pool.query(
      'INSERT INTO stow_requests (study_uid, series_uid, object_uid, ae_title) VALUES ($1, $2, $3, $4)',
      [studyUID, seriesUID, objectUID, aeTitle]
    );
  } catch (error) {
    console.error('Error logging STOW request:', error);
    throw error;
  }
};

const getLogs = async (table, limit, offset) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${table} ORDER BY timestamp DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return rows;
  } catch (error) {
    console.error(`Error fetching logs from ${table}:`, error);
    throw error;
  }
};

const getLogCount = async (table) => {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM ${table}`);
    return parseInt(rows[0].count, 10);
  } catch (error) {
    console.error(`Error fetching log count from ${table}:`, error);
    throw error;
  }
};

module.exports = {
  pool,
  getUsers,
  addUser,
  updateUserRole,
  deleteUser,
//  updateUser,
  getUserByUsername,
  getAETitles,
  addAETitle,
  updateAETitle,
  deleteAETitle,
  logWadoRequest,
  logQidoRequest,
  logStowRequest,
  getLogs,
  getLogCount,
};
