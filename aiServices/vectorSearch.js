// aiServices/vectorSearch.js
const TextChunkSchema = require("../models/TextChunkSchema");
const logger = require("../utils/logger");

async function findRelevantChunks(queryEmbedding, limit = 5, adminId) {
  try {
    // Validate input embedding dimensions
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 384) {
      throw new Error(
        `Invalid embedding dimensions: Expected 384, got ${queryEmbedding?.length}`
      );
    }

    const results = await TextChunkSchema.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 200, // Increased for better recall
          limit: Math.min(limit * 3, 100), // Get more candidates for filtering
        },
      },
      {
        $addFields: {
          searchScore: { $meta: "vectorSearchScore" },
        },
      },
      {
        $match: {
          user: adminId,
          searchScore: { $gte: 0.4 } // Optimized threshold balance
        },
      },
      {
        $project: {
          text: 1,
          chunkIndex: 1,
          file: 1,
          metadata: 1,
          score: { $round: ["$searchScore", 4] },
        },
      },
      { $limit: limit },
    ]);

    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    logger.error("Vector search failed:", {
      error: error.message,
      queryDims: queryEmbedding?.length,
      stack: error.stack,
    });
    throw new Error("Failed to perform vector search");
  }
}

module.exports = { findRelevantChunks };
