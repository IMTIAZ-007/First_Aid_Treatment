CREATE DATABASE IF NOT EXISTS project1;
USE project1;
-- Create treatment table
CREATE TABLE treatments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  details TEXT NOT NULL,
  image_path VARCHAR(255),
  video_path VARCHAR(255),
  related_medicine VARCHAR(255)
);

-- Create medicine table
CREATE TABLE medicines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255),
  details TEXT,
  related_medicine VARCHAR(255)
);

-- Optional: Admin login table (or use fixed ID/pass in backend)
CREATE TABLE admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(100) NOT NULL
);

-- Insert default admin
INSERT INTO admins (username, password) VALUES ('admin', 'admin');
