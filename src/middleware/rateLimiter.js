import rateLimit from "express-rate-limit";

// Rate limiter for receipt scanning endpoint: max 15 requests per 15 minutes per IP
export const parseRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 requests per window
  standardHeaders: true, // Return standard RateLimit headers
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⏳ [RATE LIMIT TRIGGERED] IP ${req.ip} exceeded receipt parsing quota.`);
    return res.status(429).json({
      success: false,
      error: "Rate limit reached: too many receipt scans in a short time. Please wait 15 minutes and try again.",
    });
  },
});

// General rate limiter for health/info endpoints: max 100 requests per 15 minutes per IP
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
