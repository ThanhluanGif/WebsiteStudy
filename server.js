// Nạp biến môi trường từ file .env
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();

// ===== CẤU HÌNH PORT & MONGO_URI =====
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_key";

// Nếu không có MONGO_URI thì dừng hẳn server, báo lỗi rõ ràng
if (!MONGO_URI) {
  console.error("❌ Lỗi: MONGO_URI không tồn tại. Hãy kiểm tra lại file .env");
  process.exit(1);
}

// ===== KẾT NỐI MONGODB =====
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Đã kết nối MongoDB Atlas");
  })
  .catch((err) => {
    console.error("❌ Lỗi kết nối MongoDB:", err);
  });

// ===== MIDDLEWARE CHUNG =====
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== MODEL USER (collection 'users' trong database websiteStudy) =====
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // TẠM THỜI lưu plain text cho dễ test (giống document bạn đã tạo)
    password: { type: String, required: true },
    role: { type: String, default: "student" },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// ===== API ĐĂNG KÝ =====
// POST /api/auth/register
// Body: { name, email, password }
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ Họ tên, Email và Mật khẩu." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email đã được sử dụng." });
    }

    // TẠM: lưu password thô (giống admin demo bạn đã tạo tay)
    const user = await User.create({
      name,
      email,
      password,
      role: "student",
    });

    return res.status(201).json({
      message: "Đăng ký thành công.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Lỗi register:", err);
    res.status(500).json({ message: "Lỗi server khi đăng ký." });
  }
});

// ===== API ĐĂNG NHẬP =====
// POST /api/auth/login
// Body: { email, password }
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập Email và Mật khẩu." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // So sánh mật khẩu đơn giản (vì đang lưu plain text)
    if (user.password !== password) {
      return res
        .status(400)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // Tạo token
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        name: user.name,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Đăng nhập thành công.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Lỗi login:", err);
    res.status(500).json({ message: "Lỗi server khi đăng nhập." });
  }
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
