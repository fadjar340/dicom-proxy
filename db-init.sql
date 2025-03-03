-- Enable the pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS plpgsql;

-- Create the users table with audit trail
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',  -- 'admin' or 'user'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the ae_titles table with audit trail
CREATE TABLE IF NOT EXISTS ae_titles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  aeTitle TEXT NOT NULL,
  remoteAETitle TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the wado_requests table
CREATE TABLE IF NOT EXISTS wado_requests (
  id SERIAL PRIMARY KEY,
  study_uid TEXT,
  series_uid TEXT,
  object_uid TEXT,
  ae_title TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the qido_requests table
CREATE TABLE IF NOT EXISTS qido_requests (
  id SERIAL PRIMARY KEY,
  study_uid TEXT,
  accession_number TEXT,
  ae_title TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the stow_requests table
CREATE TABLE IF NOT EXISTS stow_requests (
  id SERIAL PRIMARY KEY,
  study_uid TEXT,
  series_uid TEXT,
  object_uid TEXT,
  ae_title TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert the default admin user (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
    INSERT INTO users (username, password, role)
    VALUES ('admin', crypt('admin123', gen_salt('bf')), 'admin');
  END IF;
END $$;
