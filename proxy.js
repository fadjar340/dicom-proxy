const express = require('express');
const { DICOMwebClient } = require('dicomweb-client');
const { Client } = require('dicom-dimse');
const bodyParser = require('body-parser');
const { passport } = require('./auth');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const morgan = require('morgan'); // Importing morgan for logging
require('dotenv').config();

const app = express();
const port = process.env.WEB_PORT || 3001;

// Get public
app.use(express.static('public'));

// Middleware to parse JSON and form data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up EJS for server-side rendering
app.set('view engine', 'ejs');
app.set('views', './views');

const session = require('express-session');
const { errorMonitor } = require('dicom-dimse/Connection');

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
})); // Initialize session before Passport
app.use(passport.initialize()); // Initialize Passport
app.use(passport.session()); // Use Passport session

// Use morgan for logging requests
app.use(morgan('combined'));

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.user) {
    return res.redirect('/login'); // Redirect to login if not authenticated
  }
  next();
};

// Helper functions for database operations
// User
const getUsers = async () => {
  const { rows } = await pool.query('SELECT * FROM users');
  return rows;
};

const addUser = async (user) => {
  const { username, password, role = 'user' } = user; // Default role to 'user'
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

const updateUser = async (user) => {
  const { username, password, role } = user;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const { rows } = await pool.query(
    'update users SET username = $1, password = $2, role = $3 WHERE username = $1RETURNING *',
    [username, hashedPassword, role]
  );
  return rows[0];
};

// AETitle
const getAETitles = async () => {
  const { rows } = await pool.query('SELECT * FROM ae_titles');
  return rows;
};

const getAETitle = async (name) => {
  const { rows } = await pool.query('SELECT * FROM ae_titles WHERE name = $1', [name]);
  return rows[0]; // Return the AETitle object
 
}

const addAETitle = async (aeTitle) => {
  const { name, host, port, aeTitle: aeTitleValue, remoteAETitle } = aeTitle;
  const { rows } = await pool.query(
    'INSERT INTO ae_titles (name, host, port, aetitle, remoteaetitle) VALUES ($1, $2, $3, $4, $5) RETURNing *',
    [name, host, port, aeTitleValue, remoteAETitle]
  );
  return rows[0];
};

const deleteAETitle = async (name) => {
  const { rowCount } = await pool.query('DELETE FROM ae_titles WHERE name = $1', [name]);
  return rowCount;
};

const updateAETitle = async (aeTitle) => {
  const { name, host, port, aeTitle: aeTitleValue, remoteAETitle } = aeTitle;
  const { rows } = await pool.query(
    'UPDATE ae_titles SET name = $1, host = $2, port = $3, aetitle = $4, remoteaetitle = $5 WHERE name = $1 RETURNing *',
    [name, host, port, aeTitleValue, remoteAETitle]
  );
  return rows;
};

const getLogs = async (logTable, limitNum, offset) => {
  const { rows } = await pool.query(`SELECT * FROM ${logTable} LIMIT $1 OFFSET $2`, [limitNum, offset]);
  return rows;
};

passport.serializeUser((user, done) => {
  done(null, user.username); // Store username in session
});

passport.deserializeUser(async (username, done) => {
  try {
    const user = await getUserByUsername(username); // Fetch user by username
    console.log('User found:', user); // Log the user object found
    done(null, user);
  } catch (err) {
    done(err);
  }
});

const getUserByUsername = async (username) => {
  console.log('Fetching user by username:', username); // Log the username being fetched
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  console.log('Fetched user rows:', rows); // Log the rows fetched from the database
  return rows[0]; // Return the user object
};

const isAdmin = (req, res, next) => {
  if (req.user.role === 'admin') {
    next(); // Allow access for admin
  } else {
    return res.redirect('/login'); // Redirect to login if not authenticated
  }
};

const isUser = (req, res, next) => {
  if (req.user.role === 'user' || req.user.role === 'admin') {
    next(); // Allow access for both user and admin
  } else {
    res.status(403).json({ error: 'Access denied: User role required' });
  }
};

// Proxy Endpoints
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

// End of Proxy Endpoints


// Start of web apps Endpoints
// All GET requests for web apps

// Login endpoint
app.get('/', (req, res) => {
  res.render('login'); // Assuming a welcome.ejs file will be created
});


app.get('/login', (req, res) => {
  res.render('login'); // Render the login view
});

app.get('/logout', (req, res) => {
req.logout((err) => { // Call the logout function from Passport with a callback
  if (err) {
    return res.status(500).json({ error: 'Logout failed' });
  }
  res.redirect('/login'); // Redirect to the login page after logout
});
});

app.get('/error', (req, res) => {
  res.render('error', { message: 'An error occurred. Please try again.' });
  });

// Users
app.get('/manage-users', async (req, res) => {
  const users = await getUsers();
  res.render('manage-users', { users });
});

//app.get('/update-user/:username', isAuthenticated, isAdmin, async (req, res) => {
//  const { username } = req.params; // Get username from request parameters
//  try {
//    const user = await getUserByUsername(username); // Fetch user by username
//    if (user) {
//      res.render('update-user', { user }); // Render edit user view with user data
//    } else {
//      res.render('update-user', { user: null, error: 'User not found' }); // Render with error message
//    }
//  } catch (error) {
//    res.render('error', { message: error.message }); // Handle any errors that occur
//  }
//}); 

app.get('/add-user', (req, res) => {
  res.render('add-user'); // Render the add-user view
  });

// AETitles
app.get('/manage-ae-titles', async (req, res) => {
  const aeTitles = await getAETitles();
  res.render('manage-ae-titles', { aeTitles });
});
  
app.get('/add-ae-title', (req, res) => {
  res.render('add-ae-title'); // Render the add-ae-title view
  });

app.get('/edit-ae-title/:name', isAuthenticated, isAdmin, async (req, res) => {
  const { name } = req.params;
     const aeTitle = await getAETitle(name); ; // Fetch the specific AE title
     if (aeTitle) {
         res.render('edit-ae-title', { aeTitle }); // Pass the aeTitle to the view
     } else {
         res.render('error', { message: 'AE Title not found' }); // Render error if not found
     }
});

// All POST endpoints
app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect('/login'); // Redirect to login if not authenticated
    req.logIn(user, (err) => {
      if (err) return next(err);
      res.redirect('/manage-users'); // Redirect to manage-users after successful login
    });
  })(req, res, next);
});

// Users
app.post('/add-user', isAuthenticated, isAdmin, async (req, res) => {
  const user = req.body;
  try {
    const newUser = await addUser(user);
    res.redirect('/manage-users'); // Redirect to manage-users after successful registration
  } catch (error) {
    return res.redirect('/login'); // Redirect to login if not authenticated
    }
}); 

app.post('/delete-user/:username', isAuthenticated, isAdmin, async (req, res) => {
  const { username } = req.params;
  try {
    await deleteUser(username);
    res.redirect('/manage-users');
  } catch (error) {
    return res.redirect('/login'); // Redirect to login if not authenticated
  }
});

//app.post('/update-user/:username', isAuthenticated, isAdmin, async (req, res) => {
//  const { username } = req.params;
//  const { password, role } = req.body; // Get updated data from the form
//  try {
//      const updateUser = await updateUser({ username, password, role }); // Update user in the database
//      res.redirect('/manage-users'); // Redirect to manage users after successful update
//  } catch (error) {
//      res.render('error', { message: error.message }); // Handle any errors that occur
//  }
//});

// AETitles
app.post('/add-ae-title', isAuthenticated, isAdmin, async (req, res) => {
  const  { name, host, port, aeTitle: aeTitleValue, remoteAETitle } = req.body;
  try {
    const newAETitle = await addAETitle({ name, host, port, aeTitle: aeTitleValue, remoteAETitle });
    res.redirect('/manage-ae-titles'); 
  } catch (error) {
    return res.redirect('/login'); // Redirect to login if not authenticated
    }
  }
); 

app.post('/delete-ae-title/:name', isAuthenticated, isAdmin, async (req, res) => {
  const { name } = req.params;
  try {
    await deleteAETitle(name);
    res.redirect('/manage-ae-titles');
  } catch (error) {
    return res.redirect('/login'); // Redirect to login if not authenticated
  }
});

app.post('/edit-ae-title/:name', isAuthenticated, isAdmin, async (req, res) => {
  const { name } = req.params;
  const { newHost, newPort, newAETitle, newremoteAETitle } = req.body; // Assuming new data is sent in the body
  try {
    // Logic to update the AE title in the database
    await updateAETitle(name, { host: newHost, port: newPort, aeTitle: newAETitle, remoteAETitle: newremoteAETitle });
    res.redirect('/manage-ae-titles');
  } catch (error) {
    return res.redirect('/login'); // Redirect to login if not authenticated
  }
});

// End of POST web apps


// Get for View Log
app.get('/view-logs',  async (req, res) => {
    const { logTable = 'wado_requests', limit = 10, page = 1 } = req.query;

    // Convert limit and page to numbers
    const limitNum = parseInt(limit, 10);
    const pageNum = parseInt(page, 10);
    const offset = (pageNum - 1) * limitNum;

    try {
      // Fetch logs
      const logs = await getLogs(logTable, limitNum, offset);
      const totalCount = await pool.query(`SELECT COUNT(*) FROM ${logTable}`);
      const totalPages = Math.ceil(totalCount.rows[0].count / limitNum);

      // Render the view-logs page
      res.render('view-logs', {
        logs,
        logTable,
        limit: limitNum,
        page: pageNum,
        totalPages,
      });
    } catch (error) {
      return res.redirect('/login'); // Redirect to login if not authenticated
    }
  });

  // Start the proxy server
app.listen(port, () => {
  console.log(`DICOM Web proxy running on port ${port}`);
})