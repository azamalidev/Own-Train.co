const jwt = require("jsonwebtoken");
const Admin = require("../models/admin");

const JWT_SECRET = process.env.JWT_SECRET;
module.exports = {
  auth: async (req, res, next) => {
    try {
      console.log("Authentication Started");
      // console.log("Req obj", req);
      console.log("Req cookies", req.cookies);

      const token = req.cookies.accessToken;

      console.log("token", token);
      if (!token) return res.status(401).json({ message: "Not authenticated" });

      const decoded = jwt.verify(token, JWT_SECRET);
      console.log("decoded", decoded);
      const admin = await Admin.findById(decoded.id);
      console.log("Decoded", decoded);
      console.log("Admin", admin);
      if (!admin) return res.status(401).json({ message: "Admin not found" });

      req.admin = admin; // Attach admin to request
      console.log("Authentication Completed");
      next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid token" });
    }
  },

  isAdmin: (req, res, next) => {
    if (req.admin && req.admin.role === "admin") {
      return next();
    }
    return res.status(403).json({ message: "Admin access required" });
  },
};
