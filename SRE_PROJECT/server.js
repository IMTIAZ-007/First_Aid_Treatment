// server.js
const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const bcrypt = require('bcryptjs');

const app  = express();
const port = 3000;

// ───── MIDDLEWARE ─────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ───── SERVE STATIC FILES ──────────────────────────────────────
// Anything in ./public will be served at its URL path
app.use(express.static(path.join(__dirname, 'public')));

// ───── UPLOADS FOLDER ──────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// ───── DATABASE SETUP ──────────────────────────────────────────
const db = mysql.createConnection({
  host:     'localhost',
  user:     'root',
  password: '2130',
  database: 'project1'
});
db.connect(err => {
  if (err) {
    console.error('❌ DB connection error:', err);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL.');
});

// ───── MULTER CONFIG (for treatment media uploads) ─────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const safeName = file.originalname.replace(/\s/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({ storage });

// ───── TREATMENTS ROUTES ───────────────────────────────────────
// GET all treatments
app.get('/get-treatments', (req, res) => {
  db.query('SELECT * FROM treatments ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const data = results.map(r => ({
      ...r,
      image: r.image_path ? `${req.protocol}://${req.get('host')}/uploads/${r.image_path}` : null,
      video: r.video_path ? `${req.protocol}://${req.get('host')}/uploads/${r.video_path}` : null
    }));
    res.json(data);
  });
});

// POST add treatment
app.post('/add-treatment', upload.fields([{ name: 'image' }, { name: 'video' }]), (req, res) => {
  const { name, details, related_medicine } = req.body;
  if (!name || !details) return res.status(400).send('Name and details are required.');

  const imageFile = req.files?.image?.[0]?.filename || null;
  const videoFile = req.files?.video?.[0]?.filename || null;
  const sql = `
    INSERT INTO treatments
      (name, details, image_path, video_path, related_medicine)
    VALUES (?, ?, ?, ?, ?)`;
  db.query(sql, [name, details, imageFile, videoFile, related_medicine || null], err => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    res.send('Treatment added successfully.');
  });
});

// POST update treatment
app.post('/update-treatment', (req, res) => {
  const { id, name, details, related_medicine } = req.body;
  if (!id || !name || !details) return res.status(400).send('ID, name, and details are required.');

  const sql = `UPDATE treatments SET name=?, details=?, related_medicine=? WHERE id=?`;
  db.query(sql, [name, details, related_medicine || null, id], (err, result) => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    if (result.affectedRows === 0) return res.status(404).send('Treatment not found.');
    res.send('Treatment updated successfully.');
  });
});

// POST delete treatment
app.post('/delete-treatment', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send('ID is required.');

  db.query('SELECT image_path, video_path FROM treatments WHERE id=?', [id], (err, rows) => {
    if (err) return res.status(500).send('Database error');
    if (rows.length === 0) return res.status(404).send('Treatment not found.');

    const { image_path, video_path } = rows[0];
    db.query('DELETE FROM treatments WHERE id=?', [id], err2 => {
      if (err2) return res.status(500).send('Database error');
      if (image_path) fs.unlinkSync(path.join(uploadDir, image_path));
      if (video_path) fs.unlinkSync(path.join(uploadDir, video_path));
      res.send('Treatment deleted successfully.');
    });
  });
});




// GET all medicines
app.get('/get-medicines', (req, res) => {
  db.query('SELECT * FROM medicines ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const data = rows.map(row => ({
      ...row,
      image_path: row.image_path ? `${req.protocol}://${req.get('host')}/uploads/${row.image_path}` : null
    }));
    res.json(data);
  });
});

// POST add medicine
app.post('/add-medicine', upload.single('image'), (req, res) => {
  const { name, generic_name, details, related_medicine, price } = req.body;
  const imageFile = req.file ? req.file.filename : null;

  if (!name) return res.status(400).send('Medicine name is required.');

  const sql = `
    INSERT INTO medicines
      (name, generic_name, details, related_medicine, price, image_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [name, generic_name || null, details || null, related_medicine || null, price || 0.00, imageFile], err => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    res.send('Medicine added successfully.');
  });
});

app.post('/update-medicine', express.json(), async (req, res) => {
  try {
    let { id, name, generic_name, details, price, related_medicine } = req.body;

    if (!id || !name || !price) {
      return res.status(400).send('Missing required fields');
    }

    const idNum = Number(id);
    const priceNum = Number(price);

    if (isNaN(idNum) || isNaN(priceNum)) {
      return res.status(400).send('Invalid id or price');
    }

    generic_name = generic_name || null;
    details = details || null;
    related_medicine = related_medicine || null;

    const sql = `
      UPDATE medicines 
      SET name = ?, generic_name = ?, details = ?, price = ?, related_medicine = ?
      WHERE id = ?
    `;

    // Use db.promise().query for async/await:
    await db.promise().query(sql, [name, generic_name, details, priceNum, related_medicine, idNum]);

    res.send('Medicine updated successfully');
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).send('Internal Server Error');
  }
});


// POST delete medicine
app.post('/delete-medicine', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send('ID is required.');

  db.query('SELECT image_path FROM medicines WHERE id=?', [id], (err, rows) => {
    if (err) return res.status(500).send('Database error');
    if (rows.length === 0) return res.status(404).send('Medicine not found.');

    const { image_path } = rows[0];
    db.query('DELETE FROM medicines WHERE id=?', [id], err2 => {
      if (err2) return res.status(500).send('Database error');
      if (image_path) fs.unlinkSync(path.join(uploadDir, image_path)); // Remove the image file
      res.send('Medicine deleted successfully.');
    });
  });
});









app.get('/api/faqs', (req, res) => {
  db.query('SELECT * FROM faq', (err, results) => {
    if (err) {
      console.error('❌ Error fetching FAQs:', err);
      res.status(500).json({ message: 'Error fetching data from the database' });
      return;
    }
    res.json(results); // Send FAQ data as JSON response
  });
});

// Endpoint to add new FAQ
app.post('/api/faqs', (req, res) => {
  const { question, answer } = req.body;

  const query = 'INSERT INTO faq (question, answer) VALUES (?, ?)';
  db.query(query, [question, answer], (err, results) => {
    if (err) {
      console.error('❌ Error inserting FAQ:', err);
      res.status(500).json({ message: 'Error inserting data into the database' });
      return;
    }
    res.status(201).json({ id: results.insertId, question, answer });
  });
});













// Register
app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  const sql = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
  db.query(sql, [name, email, password], (err, result) => {
    if (err) return res.status(500).send(err);
    res.send({ message: 'Registered successfully!' });
  });
});




app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Query the database to find the student by email
  const sql = 'SELECT id, name, email, profile_image, balance FROM users WHERE email = ? AND password = ?';
  db.query(sql, [email, password], (err, results) => {
    if (err) return res.status(500).send(err);

    if (results.length > 0) {
      // Return student data if login is successful
      res.send({ message: 'Login successful', student: results[0] });
    } else {
      // Send error if credentials are invalid
      res.status(401).send({ message: 'Invalid credentials' });
    }
  });
});





// Setup for file upload
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Make sure this folder exists and is writable
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = 'profile_' + Date.now() + ext;
    cb(null, uniqueName);
  }
});

const profileUpload = multer({
  storage: profileStorage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'));
    }
    cb(null, true);
  }
});

// Profile update route
app.post('/update-profile', profileUpload.single('profile_image'), (req, res) => {
  const { id, balance } = req.body;
  const file = req.file;

  console.log('Received data:', { id, balance, file }); // Debug log for the received data

  let sql, params;

  if (file) {
    const profilePath = 'uploads/' + file.filename;  // Set the path to the uploaded image
    sql = 'UPDATE users SET balance = ?, profile_image = ? WHERE id = ?';
    params = [balance, profilePath, id];
  } else {
    sql = 'UPDATE users SET balance = ? WHERE id = ?';
    params = [balance, id];
  }

  console.log('Executing SQL:', sql, params); // Log the SQL and parameters being executed

  // Update the user's profile information in the database
  db.query(sql, params, (err) => {
    if (err) {
      console.error('Error executing query:', err); // Debug log for query execution error
      return res.status(500).json({ message: 'Error updating profile.' });
    }

    // Fetch the updated user profile
    db.query('SELECT id, name, email, profile_image, balance FROM users WHERE id = ?', [id], (err, result) => {
      if (err) {
        console.error('Error fetching updated user:', err); // Debug log for fetching error
        return res.status(500).json({ message: 'Error fetching updated user.' });
      }

      res.json({ message: 'Profile updated successfully!', updatedStudent: result[0] });
    });
  });
});



// Submit a review for a treatment
app.post('/submit-review', async (req, res) => {
  const { treatment_id, user_id, rating, review } = req.body;

  // Check if rating is within valid range
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  // Insert the review into the database
  const sql = 'INSERT INTO reviews (treatment_id, user_id, rating, review) VALUES (?, ?, ?, ?)';
  db.query(sql, [treatment_id, user_id, rating, review], (err, result) => {
    if (err) {
      console.error('Error submitting review:', err);
      return res.status(500).json({ message: 'Error submitting review.' });
    }
    res.json({ message: 'Review submitted successfully!' });
  });
});

// Get average rating for a treatment
app.get('/get-treatment-rating/:treatment_id', (req, res) => {
  const treatment_id = req.params.treatment_id;

  const sql = 'SELECT AVG(rating) AS average_rating FROM reviews WHERE treatment_id = ?';
  db.query(sql, [treatment_id], (err, result) => {
    if (err) {
      console.error('Error fetching average rating:', err);
      return res.status(500).json({ message: 'Error fetching average rating.' });
    }
    res.json({ average_rating: result[0].average_rating });
  });
});





// Submit a review and rating for a treatment
app.post('/submit-review', (req, res) => {
  const { treatment_id, user_id, rating, review } = req.body;

  // Check if rating is within valid range
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  // Insert the review into the database
  const sql = 'INSERT INTO reviews (treatment_id, user_id, rating, review) VALUES (?, ?, ?, ?)';
  db.query(sql, [treatment_id, user_id, rating, review], (err, result) => {
    if (err) {
      console.error('Error submitting review:', err);
      return res.status(500).json({ message: 'Error submitting review.' });
    }
    res.json({ message: 'Review submitted successfully!' });
  });
});

// Get the average rating for a treatment
app.get('/get-treatment-rating/:treatment_id', (req, res) => {
  const treatment_id = req.params.treatment_id;

  const sql = 'SELECT AVG(rating) AS average_rating FROM reviews WHERE treatment_id = ?';
  db.query(sql, [treatment_id], (err, result) => {
    if (err) {
      console.error('Error fetching average rating:', err);
      return res.status(500).json({ message: 'Error fetching average rating.' });
    }

    // If no reviews exist for the treatment, return 0
    const averageRating = result[0].average_rating || 0;
    res.json({ average_rating: averageRating });
  });
});


// Route to get all reviews for treatments
app.get('/get-all-reviews', (req, res) => {
  const sql = `
    SELECT 
      treatments.name AS treatment_name,
      reviews.rating,
      reviews.review_text,
      reviews.created_at,
      users.name AS reviewer_name
    FROM reviews
    JOIN treatments ON reviews.treatment_id = treatments.id
    JOIN users ON reviews.user_id = users.id
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching reviews:', err);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }
    res.json(results);
  });
});



app.post('/submit-review', (req, res) => {
  const { treatment_id, user_id, rating, review } = req.body;

  // Check if rating is within valid range
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }

  // Insert the review into the database
  const sql = 'INSERT INTO reviews (treatment_id, user_id, rating, review) VALUES (?, ?, ?, ?)';
  db.query(sql, [treatment_id, user_id, rating, review], (err, result) => {
    if (err) {
      console.error('Error submitting review:', err);
      return res.status(500).json({ message: 'Error submitting review.' });
    }
    res.json({ message: 'Review submitted successfully!' });
  });
});


// Get reviews for a specific treatment
app.get('/get-treatment-reviews/:treatment_id', (req, res) => {
  const treatment_id = req.params.treatment_id;

  const sql = 'SELECT reviews.review_text, users.name AS reviewer_name FROM reviews JOIN users ON reviews.user_id = users.id WHERE reviews.treatment_id = ?';
  db.query(sql, [treatment_id], (err, result) => {
    if (err) {
      console.error('Error fetching reviews:', err);
      return res.status(500).json({ message: 'Error fetching reviews.' });
    }
    res.json(result);
  });
});








// Emergency Contacts Routes (no auth, user_id passed explicitly)

// Get all emergency contacts for a user
app.get('/api/emergency-contacts/:user_id', (req, res) => {
  const user_id = req.params.user_id;
  if (!user_id) return res.status(400).json({ error: 'User ID required' });

  const sql = 'SELECT id, name, phone FROM emergency_contacts WHERE user_id = ?';
  db.query(sql, [user_id], (err, rows) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Add a new emergency contact for a user
app.post('/api/emergency-contacts', (req, res) => {
  const { user_id, name, phone } = req.body;
  if (!user_id) return res.status(400).json({ error: 'User ID required' });
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });

  const sql = 'INSERT INTO emergency_contacts (user_id, name, phone) VALUES (?, ?, ?)';
  db.query(sql, [user_id, name, phone], (err, result) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id: result.insertId, name, phone });
  });
});

// Delete an emergency contact by id for a user
app.delete('/api/emergency-contacts/:id/:user_id', (req, res) => {
  const id = req.params.id;
  const user_id = req.params.user_id;
  if (!user_id) return res.status(400).json({ error: 'User ID required' });

  const sql = 'DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?';
  db.query(sql, [id, user_id], (err, result) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true });
  });
});





// Add Lab Test
app.post('/add-lab-test', (req, res) => {
  const { name, description, price } = req.body;
  if (!name || !price) return res.status(400).send("Required fields missing.");
  db.query('INSERT INTO lab_tests (name, description, price) VALUES (?, ?, ?)', [name, description, price], err => {
    if (err) return res.status(500).send('Error inserting lab test.');
    res.send('Lab test added successfully.');
  });
});

// Get Lab Tests
app.get('/get-lab-tests', (req, res) => {
  db.query('SELECT * FROM lab_tests ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).send('Error fetching lab tests.');
    res.json(rows);
  });
});

app.post('/update-lab-test', (req, res) => {
  const { id, name, description, price } = req.body;

  if (!id || !name || !price) {
    return res.status(400).send('Required fields missing.');
  }

  const sql = `UPDATE lab_tests SET name = ?, description = ?, price = ? WHERE id = ?`;

  db.query(sql, [name, description || null, price, id], (err, result) => {
    if (err) return res.status(500).send('Database error: ' + err.message);
    if (result.affectedRows === 0) return res.status(404).send('Lab test not found.');
    res.send('Lab test updated successfully.');
  });
});


// Delete Lab Test
app.post('/delete-lab-test', (req, res) => {
  const { id } = req.body;
  db.query('DELETE FROM lab_tests WHERE id=?', [id], err => {
    if (err) return res.status(500).send('Error deleting lab test.');
    res.send('Lab test deleted successfully.');
  });
});




app.get('/profile/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const [rows] = await pool.query('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});


// POST to create or update user profile
app.post('/profile', (req, res) => {
  const { user_id, age, blood_group, medical_history } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  // Check if profile exists
  const checkSql = 'SELECT * FROM user_profiles WHERE user_id = ?';
  db.query(checkSql, [user_id], (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length > 0) {
      // Update existing profile
      const updateSql = `UPDATE user_profiles 
                         SET age = ?, blood_group = ?, medical_history = ? 
                         WHERE user_id = ?`;
      db.query(updateSql, [age, blood_group, medical_history, user_id], (err2) => {
        if (err2) {
          console.error('Error updating profile:', err2);
          return res.status(500).json({ error: 'Failed to update profile' });
        }
        res.json({ message: 'Profile updated successfully' });
      });
    } else {
      // Insert new profile
      const insertSql = `INSERT INTO user_profiles (user_id, age, blood_group, medical_history) 
                         VALUES (?, ?, ?, ?)`;
      db.query(insertSql, [user_id, age, blood_group, medical_history], (err3) => {
        if (err3) {
          console.error('Error inserting profile:', err3);
          return res.status(500).json({ error: 'Failed to create profile' });
        }
        res.json({ message: 'Profile created successfully' });
      });
    }
  });
});




// Admin - Add Doctor with available date
app.post('/add-doctor', (req, res) => {
  const { name, specialty, available_date } = req.body;
  db.query('INSERT INTO doctors (name, specialty, available_date) VALUES (?, ?, ?)', [name, specialty, available_date], (err, result) => {
    if (err) return res.status(500).send(err);
    res.send('Doctor added');
  });
});

// Get all doctors
app.get('/doctors', (req, res) => {
  db.query('SELECT * FROM doctors', (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

// Book appointment by user for a specific doctor and date
app.post('/book', (req, res) => {
  const { doctor_id, user_name } = req.body;
  db.query('SELECT * FROM appointments WHERE doctor_id = ? AND date = (SELECT available_date FROM doctors WHERE id = ?)', [doctor_id, doctor_id], (err, results) => {
    if (err) return res.status(500).send(err);
    if (results.length > 0) return res.status(400).send('Doctor already appointed on this date.');

    db.query('SELECT available_date FROM doctors WHERE id = ?', [doctor_id], (err, docResult) => {
      if (err) return res.status(500).send(err);
      const appointmentDate = docResult[0].available_date;

      db.query('INSERT INTO appointments (doctor_id, user_name, date) VALUES (?, ?, ?)', [doctor_id, user_name, appointmentDate], (err, result) => {
        if (err) return res.status(500).send(err);
        res.send('Appointment booked');
      });
    });
  });
});

// Cancel appointment by user
app.post('/cancel', (req, res) => {
  const { doctor_id, user_name } = req.body;
  db.query('DELETE FROM appointments WHERE doctor_id = ? AND user_name = ?', [doctor_id, user_name], (err, result) => {
    if (err) return res.status(500).send(err);
    if (result.affectedRows === 0) return res.status(404).send('No appointment found to cancel.');
    res.send('Appointment canceled');
  });
});









// ───── START SERVER ───────────────────────────────────────────
app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
});
