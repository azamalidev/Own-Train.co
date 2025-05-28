const Feedback = require("../models/Feedback");

// Store or update feedback
exports.submitFeedback = async (req, res) => {
  try {
    const {
      conversationId,
      userId,
      messageId,
      aiResponse,
      feedbackScore,
      feedbackText,
    } = req.body;

    // Upsert feedback (update if exists, insert if not)
    const feedback = await Feedback.findOneAndUpdate(
      { messageId },
      {
        conversationId,
        userId,
        messageId,
        aiResponse,
        feedbackScore,
        feedbackText,
        updatedAt: Date.now(),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    res.status(200).json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get feedback for a specific message
exports.getFeedback = async (req, res) => {
  try {
    const { messageId } = req.params;
    const feedback = await Feedback.findOne({ messageId });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: "Feedback not found",
      });
    }

    res.status(200).json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Get all feedback for analytics
exports.getFeedbackAnalytics = async (req, res) => {
  try {
    const feedbackStats = await Feedback.aggregate([
      {
        $match: {
          feedbackScore: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          averageScore: { $avg: "$feedbackScore" },
          totalResponses: { $sum: 1 },
          scoreDistribution: {
            $push: {
              score: "$feedbackScore",
              count: 1,
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          averageScore: 1,
          totalResponses: 1,
          scoreDistribution: {
            $reduce: {
              input: "$scoreDistribution",
              initialValue: [],
              in: {
                $let: {
                  vars: {
                    existing: {
                      $filter: {
                        input: "$$value",
                        as: "item",
                        cond: { $eq: ["$$item.score", "$$this.score"] },
                      },
                    },
                  },
                  in: {
                    $cond: {
                      if: { $eq: [{ $size: "$$existing" }, 0] },
                      then: {
                        $concatArrays: [
                          "$$value",
                          [
                            {
                              score: "$$this.score",
                              count: "$$this.count",
                            },
                          ],
                        ],
                      },
                      else: {
                        $map: {
                          input: "$$value",
                          as: "item",
                          in: {
                            $cond: {
                              if: { $eq: ["$$item.score", "$$this.score"] },
                              then: {
                                score: "$$item.score",
                                count: {
                                  $add: ["$$item.count", "$$this.count"],
                                },
                              },
                              else: "$$item",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]);

    const withCommentsCount = await Feedback.countDocuments({
      feedbackText: { $exists: true, $ne: null, $ne: "" },
    });

    const result = {
      averageScore: feedbackStats[0]?.averageScore || 0,
      totalResponses: feedbackStats[0]?.totalResponses || 0,
      scoreDistribution: feedbackStats[0]?.scoreDistribution || [],
      withCommentsCount,
      withCommentsPercentage: feedbackStats[0]
        ? (withCommentsCount / feedbackStats[0].totalResponses) * 100
        : 0,
    };

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
