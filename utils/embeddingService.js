const logger = require("./logger");

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

async function createEmbeddings(inputChunks) {
  console.log("Start enriching the text", inputChunks);
  const chunks = (
    Array.isArray(inputChunks) ? [...inputChunks] : [inputChunks]
  ).map((chunk) => {
    if (typeof chunk === "string") return { text: chunk.trim(), meta: {} };
    if (chunk?.text && typeof chunk.text === "string")
      return {
        text: chunk.text.trim(),
        meta: { ...(chunk.meta || {}) },
      };
    throw new Error(
      `Invalid chunk format: ${JSON.stringify(chunk).slice(0, 50)}`
    );
  });

  if (!chunks.length) throw new Error("No valid chunks provided");

  try {
    const model = await initializeModel();
    logger.info(`Processing ${chunks.length} chunks`);

    // ڈائنامک بیچ سائز مینجمنٹ
    const batchSize = Math.min(4, Math.max(1, Math.floor(4 / chunks.length)));
    const allEmbeddings = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.text);

      // بیچ پروسیسنگ کو محفوظ بنائیں
      try {
        const output = await model(texts, {
          pooling: "mean",
          normalize: true,
        });

        const batchEmbeddings = output.tolist();
        allEmbeddings.push(
          ...batchEmbeddings.map((e, idx) => ({
            embedding: e,
            meta: batch[idx].meta,
          }))
        );
      } catch (batchError) {
        logger.error(`Batch ${i / batchSize + 1} failed`, {
          chunks: texts.map((t) => t.slice(0, 20)),
          error: batchError.message,
        });
        throw batchError;
      }
    }

    const result = allEmbeddings.map((e) => e.embedding);
    return Array.isArray(inputChunks) ? result : result[0];
  } catch (error) {
    logger.error("Embedding generation failed", {
      inputType: Array.isArray(inputChunks) ? "array" : "single",
      chunkCount: chunks.length,
      lastChunkText: chunks[chunks.length - 1]?.text?.slice(0, 20) || "N/A",
    });
    throw new Error(`Embedding failed: ${error.message}`);
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

module.exports = {
  createEmbeddings,
  initializeModel,
  validateEmbeddings,
};
