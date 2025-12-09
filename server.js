// Nạp biến môi trường từ file .env
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const jwt = require("jsonwebtoken");

// TẠO APP TRƯỚC, rồi mới được dùng app.get, app.post, ...
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
    role: { type: String, default: "student" }, // "student" hoặc "admin"
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// ===== MODEL VIDEO =====
const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, default: "" }, // Môn học
    description: { type: String, default: "" },
    durationMinutes: { type: Number, default: 0 },
    videoUrl: { type: String, required: true },
    thumbnailUrl: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    avgRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true }, // Ẩn/hiện video
  },
  { timestamps: true }
);

const Video = mongoose.model("Video", videoSchema);

// ===== MODEL COMMENT (để xoá theo video) =====
const commentSchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, default: 5 },
  },
  { timestamps: true }
);

const Comment = mongoose.model("Comment", commentSchema);

// ===== MIDDLEWARE AUTH =====

// Lấy token từ header Authorization: Bearer xxx
function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.substring(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Thiếu token. Vui lòng đăng nhập." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { userId, name, role, iat, exp }
    next();
  } catch (err) {
    console.error("Lỗi verify token:", err);
    return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn." });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res
        .status(403)
        .json({ message: "Bạn không có quyền truy cập tài nguyên này." });
    }
    next();
  };
}

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

    // LOG 1: Xem frontend gửi gì lên
    console.log("🔹 LOGIN REQUEST:", { email, password });

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập Email và Mật khẩu." });
    }

    const user = await User.findOne({ email });

    // LOG 2: Xem user trong DB
    console.log(
      "🔹 FOUND USER:",
      user ? { email: user.email, password: user.password, role: user.role } : null
    );

    if (!user) {
      return res
        .status(400)
        .json({ message: "Email hoặc mật khẩu không đúng." });
    }

    // So sánh mật khẩu đơn giản (vì đang lưu plain text)
    if (user.password !== password) {
      console.log("🔹 PASSWORD NOT MATCH");
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

    console.log("✅ LOGIN OK:", { email: user.email, role: user.role });

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

// ======================== VIDEO API ========================

// (1) ADMIN TẠO VIDEO MỚI
// POST /api/videos
// Body: { title, subject, durationMinutes, videoUrl, thumbnailUrl, description }
app.post("/api/videos", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const {
      title,
      subject,
      durationMinutes,
      videoUrl,
      thumbnailUrl,
      description,
    } = req.body || {};

    if (!title || !videoUrl) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập ít nhất Tiêu đề và Link video." });
    }

    const video = await Video.create({
      title,
      subject: subject || "",
      durationMinutes: durationMinutes || 0,
      videoUrl,
      thumbnailUrl: thumbnailUrl || "",
      description: description || "",
      createdBy: req.user.userId,
      isPublished: true,
    });

    return res.status(201).json({
      message: "Tạo video thành công.",
      video,
    });
  } catch (err) {
    console.error("Lỗi tạo video:", err);
    res.status(500).json({ message: "Lỗi server khi tạo video." });
  }
});

// (2) HỌC VIÊN LẤY DANH SÁCH VIDEO
// GET /api/videos?subject=...&page=1&limit=12
app.get("/api/videos", async (req, res) => {
  try {
    const subject = req.query.subject || "";
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "12", 10);

    const filter = { isPublished: { $ne: false } }; // chỉ lấy video đang hiển thị
    if (subject) {
      filter.subject = subject;
    }

    const total = await Video.countDocuments(filter);
    const videos = await Video.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      videos,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Lỗi lấy danh sách video:", err);
    res.status(500).json({ message: "Lỗi server khi lấy video." });
  }
});

// (3) ADMIN XEM DANH SÁCH VIDEO (THẤY CẢ VIDEO ẨN)
// GET /api/admin/videos?subject=...&page=1&limit=10
app.get(
  "/api/admin/videos",
  authRequired,
  requireRole("admin"),
  async (req, res) => {
    try {
      const subject = req.query.subject || "";
      const page = parseInt(req.query.page || "1", 10);
      const limit = parseInt(req.query.limit || "10", 10);

      const filter = {};
      if (subject) {
        filter.subject = subject;
      }

      const total = await Video.countDocuments(filter);
      const videos = await Video.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      res.json({
        videos,
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error("Lỗi admin lấy danh sách video:", err);
      res
        .status(500)
        .json({ message: "Lỗi server khi lấy video (admin)." });
    }
  }
);

// (4) ADMIN ẨN / HIỆN VIDEO
// PATCH /api/admin/videos/:id/visibility
// Body: { isPublished: true/false }
app.patch(
  "/api/admin/videos/:id/visibility",
  authRequired,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { isPublished } = req.body || {};
      if (typeof isPublished !== "boolean") {
        return res
          .status(400)
          .json({ message: "Thiếu hoặc sai kiểu trường isPublished." });
      }

      const updated = await Video.findByIdAndUpdate(
        req.params.id,
        { isPublished },
        { new: true }
      ).lean();

      if (!updated) {
        return res.status(404).json({ message: "Không tìm thấy video." });
      }

      res.json({
        message: "Cập nhật trạng thái hiển thị thành công.",
        video: updated,
      });
    } catch (err) {
      console.error("Lỗi cập nhật visibility:", err);
      res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật trạng thái hiển thị." });
    }
  }
);

// (5) ADMIN XOÁ VIDEO
// DELETE /api/admin/videos/:id
app.delete(
  "/api/admin/videos/:id",
  authRequired,
  requireRole("admin"),
  async (req, res) => {
    try {
      const deleted = await Video.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Không tìm thấy video." });
      }

      // Xoá luôn comment của video này
      await Comment.deleteMany({ video: req.params.id });

      res.json({ message: "Đã xoá video và toàn bộ comment liên quan." });
    } catch (err) {
      console.error("Lỗi xoá video:", err);
      res.status(500).json({ message: "Lỗi server khi xoá video." });
    }
  }
);

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
