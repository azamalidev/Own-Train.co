const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema({
  responseId: {
    type: String,
    required: true,
  },
  feedbackType: {
    type: String,
    enum: ["like", "dislike"],
    required: true,
  },
  reason: {
    type: String,
    required: function () {
      return this.feedbackType === "dislike";
    },
  },
  name: {
    type: String,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Feedback", feedbackSchema);
