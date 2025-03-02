const express = require('express');
const { DICOMwebClient } = require('dicomweb-client');
const { Client } = require('dicom-dimse');
const { DICOMwebServer } = require('dicomweb-server');
const bodyParser = require('body-parser');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.WEB_PORT || 3000;

// Get public
app.use(express.static('public'));

// Middleware to parse JSON and form data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up EJS for server-side rendering
app.set('view engine', 'ejs');
app.set('views', './views');

// Initialize Passport and session
app.use(passport.initialize());

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Helper functions for database operations
const getUsers = async () => {
  const { rows } = await pool.query('SELECT * FROM users');
  return rows;
};

const addUser = async (user) => {
  const { username, password, role } = user;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const { rows } = await pool.query(
    'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING *',
    [username, hashedPassword, role]
  );
  return rows[0];
};

const deleteUser = async (username) => {
  const { rowCount } = await pool.query('DELETE FROM users WHERE username = $1', [username]);
  return rowCount;
};

const getAETitles = async () => {
  const { rows } = await pool.query('SELECT * FROM ae_titles');
  return rows;
};

const addAETitle = async (aeTitle) => {
  const { name, host, port, aeTitle: aeTitleValue, remoteAETitle } = aeTitle;
  const { rows } = await pool.query(
    'INSERT INTO ae_titles (name, host, port, aeTitle, remoteAETitle) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name, host, port, aeTitleValue, remoteAETitle]
  );
  return rows[0];
};

const deleteAETitle = async (name) => {
  const { rowCount } = await pool.query('DELETE FROM ae_titles WHERE name = $1', [name]);
  return rowCount;
};

const getLogs = async () => {
  const { rows } = await pool.query('SELECT * FROM wado_requests UNION ALL SELECT * FROM qido_requests UNION ALL SELECT * FROM stow_requests');
  return rows;
};

// Middleware for role-based access control
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

// DICOM Web server configuration (for OHIF Viewer)
const dicomWebServer = new DICOMwebServer({
  port: process.env.DICOM_WEB_PORT || 8080, // Port for DICOM Web requests
  wado: {
    basePath: '/wado',
  },
  qido: {
    basePath: '/qido',
  },
  stow: {
    basePath: '/stow',
  },
});

// Helper function to get DIMSE client for a specific AE Title
const getDimseClient = (aeTitleConfig) => {
  return new Client({
    host: aeTitleConfig.host,
    port: aeTitleConfig.port,
    aeTitle: aeTitleConfig.aeTitle,
    remoteAETitle: aeTitleConfig.remoteAETitle,
  });
};

// Proxy endpoint for WADO-RS
app.get('/wado', async (req, res) => {
  const { studyUID, seriesUID, objectUID, aeTitle } = req.query;

  try {
    // Log the WADO request
    await pool.query(
      'INSERT INTO wado_requests (study_uid, series_uid, object_uid, ae_title) VALUES ($1, $2, $3, $4)',
      [studyUID, seriesUID, objectUID, aeTitle]
    );

    // Fetch metadata from the specified AE Title using C-FIND
    const aeTitles = await getAETitles();
    const aeTitleConfig = aeTitles.find((config) => config.name === aeTitle);
    if (!aeTitleConfig) {
      throw new Error(`AE Title ${aeTitle} not found`);
    }

    const dimseClient = getDimseClient(aeTitleConfig);
    const findResponse = await dimseClient.sendCFindRequest({
      studyInstanceUID: studyUID,
      seriesInstanceUID: seriesUID,
      sopInstanceUID: objectUID,
    });

    // Return metadata to the OHIF Viewer
    res.json(findResponse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy endpoint for QIDO-RS
app.get('/qido', async (req, res) => {
  const { studyUID, accessionNumber, aeTitle } = req.query;

  try {
    // Log the QIDO request
    await pool.query(
      'INSERT INTO qido_requests (study_uid, accession_number, ae_title) VALUES ($1, $2, $3)',
      [studyUID, accessionNumber, aeTitle]
    );

    // Fetch study metadata from the specified AE Title using C-FIND
    const aeTitles = await getAETitles();
    const aeTitleConfig = aeTitles.find((config) => config.name === aeTitle);
    if (!aeTitleConfig) {
      throw new Error(`AE Title ${aeTitle} not found`);
    }

    const query = {
      studyInstanceUID: studyUID,
      accessionNumber: accessionNumber,
    };

    const dimseClient = getDimseClient(aeTitleConfig);
    const findResponse = await dimseClient.sendCFindRequest(query);

    // Return study metadata to the OHIF Viewer
    res.json(findResponse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy endpoint for STOW-RS
app.post('/stow', async (req, res) => {
  const { studyUID, seriesUID, objectUID, data, aeTitle } = req.body;

  try {
    // Log the STOW request
    await pool.query(
      'INSERT INTO stow_requests (study_uid, series_uid, object_uid, ae_title) VALUES ($1, $2, $3, $4)',
      [studyUID, seriesUID, objectUID, aeTitle]
    );

    // Forward the DICOM file to the specified AE Title using C-STORE
    const aeTitles = await getAETitles();
    const aeTitleConfig = aeTitles.find((config) => config.name === aeTitle);
    if (!aeTitleConfig) {
      throw new Error(`AE Title ${aeTitle} not found`);
    }

    const dimseClient = getDimseClient(aeTitleConfig);
    const storeResponse = await dimseClient.sendCStoreRequest({
      studyInstanceUID: studyUID,
      seriesInstanceUID: seriesUID,
      sopInstanceUID: objectUID,
      data: Buffer.from(data, 'base64'), // Convert base64 to binary
    });

    // Return success response to the OHIF Viewer
    res.json({ success: true, storeResponse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login endpoint
app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info.message });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token });
  })(req, res, next);
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Admin-only routes (read-write access)
app.get('/manage-users', authenticateToken, isAdmin, async (req, res) => {
  const users = await getUsers();
  res.render('manage-users', { users });
});

app.post('/add-user', authenticateToken, isAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  try {
    await addUser({ username, password, role });
    res.redirect('/manage-users');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/delete-user/:username', authenticateToken, isAdmin, async (req, res) => {
  const { username } = req.params;
  try {
    await deleteUser(username);
    res.redirect('/manage-users');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/manage-ae-titles', authenticateToken, isAdmin, async (req, res) => {
  const aeTitles = await getAETitles();
  res.render('manage-ae-titles', { aeTitles });
});

app.post('/add-ae-title', authenticateToken, isAdmin, async (req, res) => {
  const { name, host, port, aeTitle, remoteAETitle } = req.body;
  try {
    await addAETitle({ name, host, port, aeTitle, remoteAETitle });
    res.redirect('/manage-ae-titles');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/delete-ae-title/:name', authenticateToken, isAdmin, async (req, res) => {
  const { name } = req.params;
  try {
    await deleteAETitle(name);
    res.redirect('/manage-ae-titles');
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User and admin routes (read-only access)
app.get('/view-logs', authenticateToken, isUser, async (req, res) => {
    const { logTable = 'wado_requests', limit = 10, page = 1 } = req.query;
  
    // Convert limit and page to numbers
    const limitNum = parseInt(limit, 10);
    const pageNum = parseInt(page, 10);
    const offset = (pageNum - 1) * limitNum;
  
    try {
      // Fetch logs and total count
      const logs = await getLogs(logTable, limitNum, offset);
      const totalCount = await getLogCount(logTable);
      const totalPages = Math.ceil(totalCount / limitNum);
  
      // Render the view-logs page
      res.render('view-logs', {
        logs,
        logTable,
        limit: limitNum,
        page: pageNum,
        totalPages,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
// Start the DICOM Web server
dicomWebServer.start();

// Start the proxy server
app.listen(port, () => {
  console.log(`DICOM Web proxy running on port ${port}`);
});