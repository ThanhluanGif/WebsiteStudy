require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_key";

if (!MONGO_URI) {
  console.error("Missing MONGO_URI. Please update your .env file.");
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

// ===== Models =====
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["student", "admin"], default: "student" },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, default: "" },
    description: { type: String, default: "" },
    durationMinutes: { type: Number, default: 0 },
    videoUrl: { type: String, required: true },
    thumbnailUrl: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    avgRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    totalViews: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Video = mongoose.model("Video", videoSchema);

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

// ===== Helpers =====
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parsePagination(req, defaults = { page: 1, limit: 12, maxLimit: 50 }) {
  const page = Math.max(parseInt(req.query.page || defaults.page, 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || defaults.limit, 10), 1),
    defaults.maxLimit
  );
  return { page, limit };
}

// ===== Auth middlewares =====
function authRequired(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

  if (!token) {
    return res.status(401).json({ message: "Thieu token. Vui long dang nhap." });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token khong hop le hoac da het han." });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: "Ban khong co quyen truy cap tai nguyen nay." });
    }
    next();
  };
}

// ===== Auth APIs =====
app.post("/api/auth/register", async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    const email = (req.body?.email || "").trim().toLowerCase();
    const password = (req.body?.password || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Vui long nhap day du ho ten, email va mat khau.",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ message: "Email khong hop le." });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Mat khau can toi thieu 6 ky tu." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email da duoc su dung." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "student",
    });

    return res.status(201).json({
      message: "Dang ky thanh cong.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Loi server khi dang ky." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const password = (req.body?.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ message: "Vui long nhap email va mat khau." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json({ message: "Email hoac mat khau khong dung." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Email hoac mat khau khong dung." });
    }

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
      message: "Dang nhap thanh cong.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Loi server khi dang nhap." });
  }
});

// ===== Video APIs =====
app.post("/api/videos", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const title = (req.body?.title || "").trim();
    const subject = (req.body?.subject || "").trim();
    const description = (req.body?.description || "").trim();
    const videoUrl = (req.body?.videoUrl || "").trim();
    const thumbnailUrl = (req.body?.thumbnailUrl || "").trim();
    const rawDuration = Number(req.body?.durationMinutes);
    const durationMinutes = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;

    if (!title || !videoUrl) {
      return res
        .status(400)
        .json({ message: "Vui long nhap it nhat Tieu de va Link video." });
    }

    const video = await Video.create({
      title,
      subject,
      durationMinutes,
      videoUrl,
      thumbnailUrl,
      description,
      createdBy: req.user.userId,
      isPublished: true,
    });

    return res.status(201).json({
      message: "Tao video thanh cong.",
      video,
    });
  } catch (err) {
    console.error("Create video error:", err);
    res.status(500).json({ message: "Loi server khi tao video." });
  }
});

app.get("/api/videos", async (req, res) => {
  try {
    const { page, limit } = parsePagination(req, { page: 1, limit: 12, maxLimit: 50 });
    const subject = (req.query.subject || "").trim();

    const filter = { isPublished: { $ne: false } };
    if (subject) {
      filter.subject = subject;
    }

    const [total, videos] = await Promise.all([
      Video.countDocuments(filter),
      Video.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      videos,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("List videos error:", err);
    res.status(500).json({ message: "Loi server khi lay video." });
  }
});

app.get("/api/admin/videos", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req, { page: 1, limit: 10, maxLimit: 50 });
    const subject = (req.query.subject || "").trim();

    const filter = {};
    if (subject) {
      filter.subject = subject;
    }

    const [total, videos] = await Promise.all([
      Video.countDocuments(filter),
      Video.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      videos,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Admin list videos error:", err);
    res.status(500).json({ message: "Loi server khi lay video (admin)." });
  }
});

app.patch(
  "/api/admin/videos/:id/visibility",
  authRequired,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { isPublished } = req.body || {};
      if (typeof isPublished !== "boolean") {
        return res.status(400).json({ message: "Truong isPublished phai la boolean." });
      }

      const updated = await Video.findByIdAndUpdate(
        req.params.id,
        { isPublished },
        { new: true }
      ).lean();

      if (!updated) {
        return res.status(404).json({ message: "Khong tim thay video." });
      }

      res.json({
        message: "Cap nhat trang thai hien thi thanh cong.",
        video: updated,
      });
    } catch (err) {
      console.error("Update visibility error:", err);
      res.status(500).json({ message: "Loi server khi cap nhat trang thai hien thi." });
    }
  }
);

app.delete(
  "/api/admin/videos/:id",
  authRequired,
  requireRole("admin"),
  async (req, res) => {
    try {
      const deleted = await Video.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Khong tim thay video." });
      }

      await Comment.deleteMany({ video: req.params.id });

      res.json({ message: "Da xoa video va toan bo binh luan lien quan." });
    } catch (err) {
      console.error("Delete video error:", err);
      res.status(500).json({ message: "Loi server khi xoa video." });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
