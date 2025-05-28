const express = require("express");
const fileController = require("../controllers/fileController");
const { auth, isAdmin } = require("../middlewares/auth");
const {registerAdmin , verifyOTP, findAdmin} = require("../middlewares/registerAdmin");
const { uploadSingle, uploadMultiple } = require("../utils/multer");
const loginAdmin = require("../middlewares/loginAdmin");
const userController = require("../controllers/userController");
const User = require("../models/User");

const router = express.Router();

// Auth Routes
router.post("/register-admin", registerAdmin); //OK
router.post("/verify-otp", verifyOTP); 
router.post("/login", loginAdmin); //OK
router.get("/find-admin", findAdmin); //OK


router.get("/verify-auth", auth, isAdmin, (req, res) => {
  res.json({
    isAuthenticated: true,
    isAdmin: true,
    admin: req.admin, // Send back admin details
  });
});

router.get("/admin-pannel", auth, (req, res) => {
  res.json({
    message: "Admin dashboard",
    stats: {
      filesUploaded: 0,
      usersRegistered: 0,
    },
  });
});

// Single file upload
router.post("/upload", auth, uploadSingle, fileController.uploadFile);

// Multiple files upload
router.post(
  "/upload-multiple",
  auth,
  uploadMultiple,
  fileController.uploadFiles
);


router.get(
  "/plan",
  fileController.getSubscribePlan
);

//other basic routes

// on the files -> routings
router.get("/files", auth, fileController.getAllFiles);
router.get("/files/:id", auth, fileController.getFileById);
router.delete("/files/:id", auth, fileController.deleteFileData);
router.delete("/files", auth, fileController.deleteMultipleFiles);

//on the users -> people requesting on the chats
router.get("/all-users", auth, async (req, res) => {
  console.log(" admin", req.admin);

  try {
    const users = await User.find({ admin: req.admin._id });
    console.log(users);
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});
module.exports = router;
