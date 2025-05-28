const multer = require("multer");
const path = require("path");
const fs = require("fs");
const createError = require("http-errors"); // Optional for better error handling

// Configure upload directory
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`Created upload directory at: ${uploadDir}`);
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    try {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-");
      const extension = path.extname(file.originalname);
      const filename = `${sanitizedName}-${uniqueSuffix}${extension}`;
      cb(null, filename);
    } catch (err) {
      cb(err);
    }
  },
});

// File type validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "application/pdf", // PDF
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
    "application/msword", // DOC
    "text/plain", // TXT
    "application/vnd.ms-excel", // XLS
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // XLSX
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      createError(
        400,
        `Invalid file type: ${
          file.mimetype
        }. Allowed types: ${allowedTypes.join(", ")}`
      ),
      false
    );
  }
};

// Upload limits
const limits = {
  fileSize: 5 * 1024 * 1024, // 10MB per file
  files: 5, // Maximum 5 files per upload
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits,
  onError: (err, next) => {
    console.error("Multer error:", err);
    next(createError(500, "File upload failed", { originalError: err }));
  },
});

// Middleware for handling single file upload
const uploadSingle = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(createError(413, "File too large. Max 5MB allowed"));
      }
      return next(err);
    }
    next();
  });
};

// Middleware for handling multiple file uploads
const uploadMultiple = (req, res, next) => {
  upload.array("files", 5)(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          createError(413, "One or more files exceed the 10MB limit")
        );
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        return next(createError(400, "Maximum 5 files allowed per upload"));
      }
      return next(err);
    }
    next();
  });
};

// Middleware for handling mixed file uploads (optional)
const uploadFields = upload.fields([
  { name: "documents", maxCount: 3 },
  { name: "images", maxCount: 2 },
]);

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadFields,
  uploadDir, // Export upload directory path if needed elsewhere
};
