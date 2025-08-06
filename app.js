// Dependencies: express, express-session, mysql2, body-parser, ejs, multer

const express = require("express");
const session = require("express-session");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const app = express();
const PORT = 3000;

// MySQL Connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "book_donation"
});

db.connect(err => {
  if (err) throw err;
  console.log("Connected to DB");
});

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: "donation_secret",
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ✅ ให้ทุกหน้าเข้าถึง user ได้ใน EJS
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

app.set("view engine", "ejs");
app.use(express.static("public"));

// Authentication Middleware
function isLoggedIn(req, res, next) {
  if (req.session.user) next();
  else res.redirect("/login");
}

// Routes
app.get("/", (req, res) => {
  db.query("SELECT * FROM books", (err, results) => {
    res.render("index", { books: results });
  });
});

// Login / Logout
app.get("/login", (req, res) => res.render("login"));
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.query("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, results) => {
    if (results.length > 0) {
      req.session.user = results[0];
      res.redirect("/");
    } else res.send("Invalid login");
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Request donation
app.post("/request-donation", isLoggedIn, (req, res) => {
  const { book_id } = req.body;
  db.query("INSERT INTO donation_requests (user_id, book_id, status) VALUES (?, ?, 'กำลังดำเนินการ')",
    [req.session.user.id, book_id], err => {
      if (err) throw err;
      res.redirect("/my-requests");
    });
});

app.get("/my-requests", isLoggedIn, (req, res) => {
  db.query(
    `SELECT dr.id, b.title, dr.status, dr.confirmed
     FROM donation_requests dr
     JOIN books b ON dr.book_id = b.id
     WHERE dr.user_id = ?`,
    [req.session.user.id],
    (err, results) => {
      if (err) throw err;
      res.render("my_requests", { requests: results });
    }
  );
});


// Admin: Manage all donation requests
app.get("/admin/requests", isLoggedIn, (req, res) => {
  if (req.session.user.role !== 'admin') return res.send("Access Denied");
  db.query(`SELECT dr.id, u.username, b.title, dr.status
            FROM donation_requests dr
            JOIN books b ON dr.book_id = b.id
            JOIN users u ON dr.user_id = u.id`,
    (err, results) => {
      if (err) throw err;
      res.render("admin_requests", { requests: results });
    });
});

// Admin: Update request status
app.post("/admin/update-status", isLoggedIn, (req, res) => {
  if (req.session.user.role !== 'admin') return res.send("Access Denied");
  const { request_id, status } = req.body;
  db.query("UPDATE donation_requests SET status = ? WHERE id = ?", [status, request_id], err => {
    if (err) throw err;
    res.redirect("/admin/requests");
  });
});

// Admin panel for adding books
app.get("/admin", isLoggedIn, (req, res) => {
  if (req.session.user.role !== 'admin') return res.send("Access Denied");
  res.render("admin");
});

app.post("/admin/add-book", isLoggedIn, upload.single("image"), (req, res) => {
  if (req.session.user.role !== 'admin') return res.send("Access Denied");
  const { title, author, category, stock, image_url, description } = req.body;
db.query("INSERT INTO books (title, author, category, stock, image_url, description) VALUES (?, ?, ?, ?, ?, ?)",
  [title, author, category, stock, image_url, description], err => {
    if (err) throw err;
    res.redirect("/");
  });
});

// Search
app.get("/search", (req, res) => {
  const { query, category } = req.query;
  let sql = "SELECT * FROM books WHERE 1=1";
  const params = [];
  if (query) {
    sql += " AND title LIKE ?";
    params.push(`%${query}%`);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  db.query(sql, params, (err, results) => {
    res.render("index", { books: results });
  });
});

// View book detail
app.get("/book/:id", (req, res) => {
  const bookId = req.params.id;
  db.query("SELECT * FROM books WHERE id = ?", [bookId], (err, results) => {
    if (err) throw err;
    if (results.length === 0) return res.send("ไม่พบหนังสือที่ต้องการ");
    res.render("book_detail", { book: results[0] });
  });
});

// User: Confirm receipt
app.post("/confirm-receipt", isLoggedIn, (req, res) => {
  const { request_id } = req.body;
  db.query(
    "UPDATE donation_requests SET confirmed = 1 WHERE id = ? AND user_id = ?",
    [request_id, req.session.user.id],
    err => {
      if (err) throw err;
      res.redirect("/my-requests");
    }
  );
});


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
