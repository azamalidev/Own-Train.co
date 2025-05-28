const Admin = require("../models/admin");
const User = require("../models/User");

const userAuth = async (req, res, next) => {
  try {
    console.log("Entering the user authentication step");
    // 1. Check for user in request body

    const { email, telephone, adminId } = req.body;
    console.log("Req body is:", req.body);

    const referer = req.headers.referer || req.headers.referrer;
    console.log("Request came from:", referer);

    // Extract domain from referer URL
    // const getDomain = (url) => {
    //   if (!url) return null;
    //   try {
    //     const domain = new URL(url).hostname.replace("www.", "");
    //     // Add this line to remove port numbers
    //     return domain.split(":")[0];
    //   } catch {
    //     return null;
    //   }
    // };

    // const clientDomain = getDomain(referer);
    // console.log("Client domain:", clientDomain);

    // console.log("Raw referer:", referer);
    // console.log(
    //   "Extracted domain before port removal:",
    //   new URL(referer).hostname.replace("www.", "")
    // );
    // console.log("Final cleaned domain:", clientDomain);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // 2. Check existing user
    let user = await User.findOne({ email });

    const admin = await Admin.findOne({ _id: adminId });
    console.log("Admin of the user is: ", admin);
    // 3. Create new user if not found
    if (!user) {
      user = new User({
        admin: admin._id,
        name: req.body.name || "Anonymous",
        email,
        telephone: telephone || null,
        role: "user",
      });
      await user.save();
      req.isNewUser = true;
    }

    console.log("storing session for ", user);

    req.user = user;

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed",
      error: error.message,
    });
  }
};

module.exports = userAuth;
