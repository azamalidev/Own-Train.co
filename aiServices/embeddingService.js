const logger = require("../utils/logger");

let extractor;

// Initialize the embedding model
async function initializeModel() {
  if (!extractor) {
    try {
      const { pipeline } = await import("@xenova/transformers");
      extractor = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        {
          quantized: true,
          progress_callback: (progress) => {
            logger.info(
              `Model download progress: ${Math.round(
                (progress.loaded / progress.total) * 100
              )}%`
            );
          },
        }
      );
      logger.info("Embedding model ready");
      return extractor;
    } catch (error) {
      logger.error("Model initialization failed:", error);
      throw new Error("Failed to initialize embedding model");
    }
  }
  return extractor;
}

// Create embeddings for text chunks
async function createEmbeddings(chunks) {
  // console.log("Start making the context rich", chunks);
  // console.log("Chunks", chunks);
  if (!chunks?.length) {
    throw new Error("No text chunks provided for embedding");
  }

  try {
    const model = await initializeModel();
    logger.info(`Creating embeddings for ${chunks.length} chunks`);

    // Process in batches for memory efficiency
    const batchSize = 4; // Reduced for better memory management on your i7-8th Gen
    const allEmbeddings = [];

    // Extract text from chunks if chunks are objects
    const texts = chunks.map((chunk) =>
      typeof chunk === "string" ? chunk : chunk.text
    );

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      logger.debug(
        `Processing batch ${i / batchSize + 1} of ${Math.ceil(
          texts.length / batchSize
        )}`
      );

      const output = await model(batch, {
        pooling: "mean",
        normalize: true,
      });

      const batchEmbeddings = output.tolist();
      allEmbeddings.push(...batchEmbeddings);
    }

    logger.info(`Successfully created ${allEmbeddings.length} embeddings`);
    return allEmbeddings;
  } catch (error) {
    logger.error("Embedding generation failed:", {
      error: error.message,
      chunkCount: chunks?.length,
      lastChunk: chunks?.slice(-1)[0]?.substring(0, 50),
    });
    throw error;
  }
}

// Validate embedding dimensions
function validateEmbeddings(embeddings) {
  if (!embeddings || !embeddings.length) return false;

  const expectedDim = 384; // Dimension for MiniLM-L6-v2
  return embeddings.every(
    (embedding) => Array.isArray(embedding) && embedding.length === expectedDim
  );
}

// Add query-specific embedding function
async function embedQuery(query) {
  if (!query || typeof query !== "string") {
    throw new Error("Invalid query input");
  }

  try {
    const model = await initializeModel();
    const output = await model(query, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = output.tolist()[0]; // Extract single embedding

    if (!validateEmbeddings([embedding])) {
      throw new Error("Invalid query embedding dimensions");
    }

    return embedding;
  } catch (error) {
    logger.error("Query embedding failed:", error);
    throw error;
  }
}

module.exports = {
  createEmbeddings,
  embedQuery, // Add this
  initializeModel,
  validateEmbeddings,
};
