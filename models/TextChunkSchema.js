const mongoose = require("mongoose");

const TextChunkSchema = new mongoose.Schema(
  {
    file: { type: mongoose.Schema.Types.ObjectId, ref: "File", required: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    metadata: {
      originalFile: String,
      fileType: String,
      // Add any other metadata you need
    },
  },
  { timestamps: true }
);

// Create vector index for efficient similarity search
TextChunkSchema.index({
  embedding: "knnVector",
  partialFilterExpression: { embedding: { $exists: true } },
  mappings: {
    dynamic: true,
    fields: {
      embedding: {
        type: "knnVector",
        dimensions: 384, // Match your embedding model dimensions
        similarity: "cosine", // Or "euclidean"/"dotProduct"
      },
    },
  },
});

// Regular indexes for filtering
TextChunkSchema.index({ user: 1 });
TextChunkSchema.index({ file: 1 });
TextChunkSchema.index({ "metadata.fileType": 1 });

module.exports = mongoose.model("TextChunk", TextChunkSchema);
