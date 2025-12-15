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

const leadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: ["ph", "hs"], required: true }, // phu huynh / hoc sinh-sv
    grade: { type: String, default: "" },
    phone: { type: String, required: true },
    email: { type: String, default: "" },
    message: { type: String, default: "" },
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
  },
  { timestamps: true }
);

const Lead = mongoose.model("Lead", leadSchema);

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // view, video_created, video_updated, video_deleted, video_visibility, lead_status
    video: { type: mongoose.Schema.Types.ObjectId, ref: "Video" },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    detail: { type: String, default: "" },
  },
  { timestamps: true }
);

const Activity = mongoose.model("Activity", activitySchema);

// ===== Helpers =====
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isBcryptHash(value = "") {
  return typeof value === "string" && value.startsWith("$2") && value.length > 30;
}

function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function optionalAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}

function parseYouTubeId(url = "") {
  if (!url) return null;
  const watch = url.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/)([A-Za-z0-9_-]{5,})/i);
  if (watch && watch[1]) return watch[1];
  const short = url.match(/youtu\.be\/([A-Za-z0-9_-]{5,})/i);
  if (short && short[1]) return short[1];
  return null;
}

function normalizeVideoLink(videoUrl = "", thumbnailUrl = "") {
  const ytId = parseYouTubeId(videoUrl);
  if (!ytId) return { videoUrl, thumbnailUrl };
  const embed = `https://www.youtube.com/embed/${ytId}`;
  const thumb = thumbnailUrl || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  return { videoUrl: embed, thumbnailUrl: thumb };
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
    const rawEmail = (req.body?.email || "").trim();
    const email = rawEmail.toLowerCase();
    const password = (req.body?.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ message: "Vui long nhap email va mat khau." });
    }

    let user = await User.findOne({ email }).select("+password");

    // Fallback: nếu email cũ đang lưu hoa/thường khác, thử tìm case-insensitive
    if (!user && rawEmail) {
      const regexEmail = new RegExp("^" + escapeRegex(rawEmail) + "$", "i");
      user = await User.findOne({ email: { $regex: regexEmail } }).select("+password");
      // Nếu tìm thấy và khác chuẩn lowercase, cập nhật lại để lần sau tra cứu nhanh
      if (user && user.email !== email) {
        await User.findByIdAndUpdate(user._id, { email });
        user.email = email;
      }
    }

    if (!user) {
      console.warn("Login: user not found", { email });
      return res.status(400).json({ message: "Email hoac mat khau khong dung." });
    }

    let isMatch = false;

    if (user.password && isBcryptHash(user.password)) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Legacy plain text password: allow one-time login then upgrade to hash
      if (user.password && user.password === password) {
        isMatch = true;
        const newHash = await bcrypt.hash(password, 10);
        await User.findByIdAndUpdate(user._id, { password: newHash }, { new: false });
        console.info("Login: upgraded legacy password to bcrypt", { userId: user._id.toString() });
      }
    }

    if (!isMatch) {
      console.warn("Login: password mismatch", {
        userId: user._id.toString(),
        hasPassword: !!user.password,
        isHash: isBcryptHash(user.password || ""),
      });
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
    const rawVideoUrl = (req.body?.videoUrl || "").trim();
    const rawThumbnailUrl = (req.body?.thumbnailUrl || "").trim();
    const rawDuration = Number(req.body?.durationMinutes);
    const durationMinutes = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 0;

    if (!title || !rawVideoUrl) {
      return res
        .status(400)
        .json({ message: "Vui long nhap it nhat Tieu de va Link video." });
    }

    const { videoUrl, thumbnailUrl } = normalizeVideoLink(rawVideoUrl, rawThumbnailUrl);

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

    await Activity.create({
      type: "video_created",
      video: video._id,
      admin: req.user.userId,
      detail: `Created: ${title}`,
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

// Video detail (published for students, all for admin)
app.get("/api/videos/:id", optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const isAdmin = req.user?.role === "admin";
    const filter = { _id: id };
    if (!isAdmin) {
      filter.isPublished = { $ne: false };
    }

    const video = await Video.findOne(filter).lean();
    if (!video) {
      return res.status(404).json({ message: "Khong tim thay video." });
    }

    const normalized = normalizeVideoLink(video.videoUrl, video.thumbnailUrl);

    // Tang view khong can doi cho admin
    await Video.updateOne({ _id: id }, { $inc: { totalViews: 1 } });
    await Activity.create({ type: "view", video: id });

    res.json({ video: { ...video, videoUrl: normalized.videoUrl, thumbnailUrl: normalized.thumbnailUrl } });
  } catch (err) {
    console.error("Get video detail error:", err);
    res.status(500).json({ message: "Loi server khi lay chi tiet video." });
  }
});

// Comment list
app.get("/api/videos/:id/comments", async (req, res) => {
  try {
    const videoId = req.params.id;
    const comments = await Comment.find({ video: videoId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("user", "name email")
      .lean();

    res.json({
      comments: comments.map((c) => ({
        id: c._id,
        content: c.content,
        rating: c.rating,
        user: c.user ? { name: c.user.name || c.user.email || "Nguoi dung" } : null,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    console.error("List comments error:", err);
    res.status(500).json({ message: "Loi server khi lay binh luan." });
  }
});

// Add comment + rating
app.post("/api/videos/:id/comments", authRequired, async (req, res) => {
  try {
    const videoId = req.params.id;
    const content = (req.body?.content || "").trim();
    const rating = Number(req.body?.rating) || 0;

    if (!content) {
      return res.status(400).json({ message: "Vui long nhap noi dung binh luan." });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating phai tu 1 den 5." });
    }

    const video = await Video.findById(videoId);
    if (!video || video.isPublished === false) {
      return res.status(404).json({ message: "Khong tim thay video." });
    }

    await Comment.create({
      video: videoId,
      user: req.user.userId,
      content,
      rating,
    });

    const newTotal = (video.totalRatings || 0) + 1;
    const newAvg = ((video.avgRating || 0) * (video.totalRatings || 0) + rating) / newTotal;

    await Video.findByIdAndUpdate(videoId, {
      totalRatings: newTotal,
      avgRating: newAvg,
    });

    res.status(201).json({ message: "Da them binh luan.", rating: newAvg, totalRatings: newTotal });
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ message: "Loi server khi them binh luan." });
  }
});

app.get("/api/admin/videos", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req, { page: 1, limit: 10, maxLimit: 50 });
    const subject = (req.query.subject || "").trim();
    const status = (req.query.status || "").trim(); // published | hidden | all
    const sortBy = (req.query.sort || "newest").trim(); // newest | views | rating
    const search = (req.query.search || "").trim().toLowerCase();

    const filter = {};
    if (subject) {
      filter.subject = subject;
    }
    if (status === "published") filter.isPublished = { $ne: false };
    if (status === "hidden") filter.isPublished = false;
    if (search) {
      filter.title = { $regex: new RegExp(escapeRegex(search), "i") };
    }

    let sort = { createdAt: -1 };
    if (sortBy === "views") sort = { totalViews: -1 };
    if (sortBy === "rating") sort = { avgRating: -1, totalRatings: -1 };

    const [total, videos] = await Promise.all([
      Video.countDocuments(filter),
      Video.find(filter)
        .sort(sort)
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

      await Activity.create({
        type: "video_visibility",
        video: req.params.id,
        admin: req.user.userId,
        detail: `Set isPublished=${isPublished}`,
      });

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
      await Activity.create({
        type: "video_deleted",
        video: req.params.id,
        admin: req.user.userId,
        detail: `Deleted video ${req.params.id}`,
      });

      res.json({ message: "Da xoa video va toan bo binh luan lien quan." });
    } catch (err) {
      console.error("Delete video error:", err);
      res.status(500).json({ message: "Loi server khi xoa video." });
    }
  }
);

// Update video (quick edit)
app.patch("/api/admin/videos/:id", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const payload = {};
    ["title", "subject", "description", "thumbnailUrl"].forEach((field) => {
      if (typeof req.body?.[field] === "string") {
        payload[field] = req.body[field].trim();
      }
    });
    if (req.body?.durationMinutes !== undefined) {
      const d = Number(req.body.durationMinutes);
      if (Number.isFinite(d) && d >= 0) payload.durationMinutes = d;
    }
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ message: "Khong co truong nao de cap nhat." });
    }

    const updated = await Video.findByIdAndUpdate(req.params.id, payload, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: "Khong tim thay video." });

    await Activity.create({
      type: "video_updated",
      video: req.params.id,
      admin: req.user.userId,
      detail: `Updated fields: ${Object.keys(payload).join(", ")}`,
    });

    res.json({ message: "Da cap nhat video.", video: updated });
  } catch (err) {
    console.error("Update video error:", err);
    res.status(500).json({ message: "Loi server khi cap nhat video." });
  }
});

// ===== LEADS (KHÁCH HÀNG) =====
app.post("/api/leads", async (req, res) => {
  try {
    const fullName = (req.body?.fullName || "").trim();
    const role = (req.body?.role || "").trim();
    const grade = (req.body?.grade || "").trim();
    const phone = (req.body?.phone || "").trim();
    const email = (req.body?.email || "").trim();
    const message = (req.body?.message || "").trim();

    if (!fullName || !role || !phone) {
      return res
        .status(400)
        .json({ message: "Vui lòng nhập Họ tên, chọn đối tượng và Số điện thoại." });
    }

    const lead = await Lead.create({
      fullName,
      role,
      grade,
      phone,
      email,
      message,
    });

    res.status(201).json({ message: "Đã gửi thông tin tư vấn.", leadId: lead._id });
  } catch (err) {
    console.error("Create lead error:", err);
    res.status(500).json({ message: "Lỗi server khi lưu thông tin tư vấn." });
  }
});

app.get("/api/admin/leads", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({ leads });
  } catch (err) {
    console.error("List leads error:", err);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách khách hàng." });
  }
});

// Update lead status
app.patch("/api/admin/leads/:id/status", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const status = (req.body?.status || "").trim();
    if (!["new", "contacted", "closed"].includes(status)) {
      return res.status(400).json({ message: "Trang thai khong hop le." });
    }
    const updated = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: "Khong tim thay lead." });

    await Activity.create({
      type: "lead_status",
      lead: req.params.id,
      admin: req.user.userId,
      detail: `Set status=${status}`,
    });

    res.json({ message: "Da cap nhat trang thai lead.", lead: updated });
  } catch (err) {
    console.error("Update lead status error:", err);
    res.status(500).json({ message: "Loi server khi cap nhat lead." });
  }
});

app.get("/api/admin/leads/stats", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const monthly = await Lead.aggregate([
      {
        $group: {
          _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": -1, "_id.m": -1 } },
      { $limit: 12 },
    ]);

    const byRole = await Lead.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    res.json({
      monthly: monthly.map((i) => ({
        label: `${i._id.m}/${i._id.y}`,
        count: i.count,
      })),
      byRole,
    });
  } catch (err) {
    console.error("Lead stats error:", err);
    res.status(500).json({ message: "Lỗi server khi thống kê khách hàng." });
  }
});

// Advanced lead stats
app.get("/api/admin/leads/stats/advanced", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lead24h = await Lead.countDocuments({ createdAt: { $gte: last24h } });

    const weekly = await Lead.aggregate([
      {
        $group: {
          _id: { y: { $isoWeekYear: "$createdAt" }, w: { $isoWeek: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": -1, "_id.w": -1 } },
      { $limit: 8 },
    ]);

    const byStatus = await Lead.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);

    res.json({
      last24h: lead24h,
      weekly: weekly.map((i) => ({ label: `Tuần ${i._id.w}/${i._id.y}`, count: i.count })),
      byStatus,
    });
  } catch (err) {
    console.error("Lead advanced stats error:", err);
    res.status(500).json({ message: "Loi server khi thong ke lead nang cao." });
  }
});

// Video stats
app.get("/api/admin/videos/stats", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const topViews = await Video.find().sort({ totalViews: -1 }).limit(5).lean();
    const topRating = await Video.find({ totalRatings: { $gt: 0 } })
      .sort({ avgRating: -1, totalRatings: -1 })
      .limit(5)
      .lean();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const dailyViews = await Activity.aggregate([
      { $match: { type: "view", createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { d: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.d": 1 } },
    ]);

    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 7 * 7); // ~7 weeks back to include current
    const weeklyViews = await Activity.aggregate([
      { $match: { type: "view", createdAt: { $gte: eightWeeksAgo } } },
      {
        $group: {
          _id: { y: { $isoWeekYear: "$createdAt" }, w: { $isoWeek: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.y": -1, "_id.w": -1 } },
      { $limit: 8 },
    ]);

    res.json({
      topViews,
      topRating,
      dailyViews: dailyViews.map((i) => ({ label: i._id.d, count: i.count })),
      weeklyViews: weeklyViews.map((i) => ({ label: `Tuần ${i._id.w}/${i._id.y}`, count: i.count })),
    });
  } catch (err) {
    console.error("Video stats error:", err);
    res.status(500).json({ message: "Loi server khi thong ke video." });
  }
});

// Admin activity log (khong bao gom view)
app.get("/api/admin/activity", authRequired, requireRole("admin"), async (req, res) => {
  try {
    const logs = await Activity.find({ type: { $ne: "view" } })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    res.json({ logs });
  } catch (err) {
    console.error("Activity log error:", err);
    res.status(500).json({ message: "Loi server khi lay nhat ky." });
  }
});
app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
