const express = require("express");
const Feedback = require("../models/Feedback");
const userAuth = require("../middlewares/userAuth");
const router = express.Router();

// Submit feedback
router.post("/post", async (req, res) => {
  try {
    console.log("REquest maeded");
    const { responseId, feedbackType, reason, ...user } = req.body;

    console.log("Body", responseId, feedbackType, reason, user);

    console.log(user, user.user);
    console.log("User is :", JSON.parse(user.user));
    const name = JSON.parse(user.user).name;
    const admin = JSON.parse(user.user).admin;
    console.log(name);
    console.log("Request recieved");
    const feedback = new Feedback({
      responseId,
      feedbackType,
      reason: feedbackType === "dislike" ? reason : undefined,
      name: name,
      user: admin,
    });

    console.log("Feedback", feedback);
    console.log("Saving the feedback");
    await feedback.save();
    res.status(201).json({ success: true, data: feedback });
  } catch (error) {
    res.status(400).json({ success: false, error: error.stack });
  }
});

// Get feedback stats for a response
router.get("/stats", async (req, res) => {
  try {
    const { email = "", id = "", admin = "" } = req.query;
    console.log("Stats component : ", email, id, admin);

    const documents = await Feedback.find({ user: admin });

    const likes = await Feedback.countDocuments({
      user: admin, // Filter by admin
      feedbackType: "like", // Filter by like
    });

    const dislikes = await Feedback.countDocuments({
      user: admin,
      feedbackType: "dislike",
    });

    res.json({
      success: true,
      data: documents,
      stats: {
        likes,
        dislikes,
        total: likes + dislikes,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
