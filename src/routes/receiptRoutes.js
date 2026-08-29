import express from "express";
import multer from "multer";
import { parseReceipt } from "../controllers/receiptController.js";
import { requireAppSecret } from "../middleware/authMiddleware.js";
import { parseRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max per upload
    files: 1, // 1 file per request
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      const err = new Error("Invalid file type. Only JPG, PNG, and WEBP images are allowed.");
      err.code = "INVALID_FILE_TYPE";
      cb(err, false);
    }
  },
});

// Middleware to handle multer file upload errors gracefully
const handleUpload = (req, res, next) => {
  upload.single("receipt")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          success: false,
          error: "Image file is too large. Maximum allowed size is 5MB.",
        });
      }
      return res.status(400).json({
        success: false,
        error: `File upload error: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: err.message || "Invalid file uploaded.",
      });
    }
    next();
  });
};

router.post(
  "/parse",
  requireAppSecret,
  parseRateLimiter,
  handleUpload,
  parseReceipt
);

export default router;
