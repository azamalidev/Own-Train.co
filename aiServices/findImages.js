// controllers/imageSearch.js
const Image = require("../models/ImageSchema");
const logger = require("../utils/logger");

async function findMatchedImages(adminId, queryEmbedding, limit = 5) {
  try {
    // Validate input embedding dimensions
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 384) {
      throw new Error(
        `Invalid embedding dimensions: Expected 384, got ${queryEmbedding?.length}`
      );
    }

    const results = await Image.aggregate([
      {
        $vectorSearch: {
          index: "image_vector_index", // Your image vector index name
          path: "textEmbedding", // Field containing embeddings
          queryVector: queryEmbedding,
          numCandidates: 200, // Broad initial candidate pool
          limit: Math.min(limit * 3, 100), // Get extra candidates for filtering
        },
      },
      {
        $addFields: {
          searchScore: { $meta: "vectorSearchScore" }, // Store the raw score
        },
      },
      {
        $match: {
          user: adminId,
          searchScore: { $gte: 0.68 }, // Minimum similarity threshold
        },
      },
      {
        $project: {
          _id: 1,
          path: 1,
          storedName: 1,
          tags: 1,
          categories: 1,
          score: { $round: ["$searchScore", 4] }, // Rounded for readability
        },
      },
      { $limit: limit },
    ]);

    console.log("results :  ", results);
    // Transform results for frontend
    return results.map((img) => ({
      imageId: img._id,
      ImagePath: img.path,
      ImageName: img.storedName,
      similarity: img.score,
      Tags: img.tags,
      Categories: img.categories,
    }));
  } catch (error) {
    logger.error("Image vector search failed:", {
      error: error.message,
      queryDims: queryEmbedding?.length,
      stack: error.stack,
    });
    return []; // Return empty array on failure
  }
}

module.exports = findMatchedImages;
