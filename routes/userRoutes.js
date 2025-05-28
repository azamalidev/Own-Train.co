const express = require("express");
const { handleChatQuery } = require("../controllers/chatController");
const userController = require("../controllers/userController");
const userAuth = require("../middlewares/userAuth");

const router = express.Router();

//response from AI
router.post("/get-response", userAuth, handleChatQuery);
router.post("/login", userAuth, (req, res) => {
  res.json({
    success: true,
    message: req.isNewUser ? "User created" : "Login successful",
    user: req.user,
  });
});
router.delete("/delchunks", userController.deleteChunks);

module.exports = router;
