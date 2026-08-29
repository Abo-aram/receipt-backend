const DEFAULT_DEV_SECRET = "billsplitter_sec_7f9a8b1c4e2d3f5a6b0c";

export const requireAppSecret = (req, res, next) => {
  const serverSecret = process.env.APP_CLIENT_SECRET || DEFAULT_DEV_SECRET;
  const clientSecret = req.headers["x-app-secret"];

  if (!clientSecret || clientSecret !== serverSecret) {
    console.warn(
      `🔒 [AUTH REJECTED] IP ${req.ip || req.connection?.remoteAddress} tried to access ${req.originalUrl} without valid X-App-Secret.`
    );
    return res.status(403).json({
      success: false,
      error: "Unauthorized request. Please use the official BillSplitter application.",
    });
  }

  next();
};
