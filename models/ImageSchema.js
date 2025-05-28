const mongoose = require("mongoose");

const TextAnnotationSchema = new mongoose.Schema(
  {
    text: String,
    confidence: Number,
  },
  { _id: false }
);

const TagSchema = new mongoose.Schema(
  {
    tag: String,
    confidence: Number,
    source: String, // 'ocr', 'vision', 'generated'
  },
  { _id: false }
);

const ImageSchema = new mongoose.Schema(
  {
    // Core File Data
    originalName: String,
    storedName: String,
    path: String,
    size: Number,
    mimetype: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    status: { type: String, default: "uploaded" },
    isAdminUpload: { type: Boolean, default: false },

    // Image Analysis
    metadata: {
      width: Number,
      height: Number,
      format: String,
      colorProfile: String,
      dominantColors: [String],
      resolution: {
        dpi: Number,
        unit: String,
      },
    },

    // Content Understanding
    sceneType: String,
    aestheticScore: Number,
    mood: String,
    style: String,
    containsFaces: Boolean,
    faceCount: Number,
    containsText: Boolean,

    // Text Extraction
    textAnnotations: [TextAnnotationSchema],

    // Semantic Understanding
    generatedCaption: String,
    detailedDescription: String,
    tags: [TagSchema],
    categories: [String],

    // Processed Files
    processedPath: String,
    thumbnailPath: String,
    // clipEmbedding: [Number],
    textEmbedding: [Number],

    // Processing Metadata
    processingTime: Number,
    processingError: String,
    modelVersions: {
      vision: String,
      text: String,
      embedding: String,
    },
  },
  { timestamps: true }
);

// Vector Indexes
ImageSchema.index(
  { textEmbedding: "cosmosSearch" },
  {
    cosmosSearchOptions: {
      kind: "vector-ivf",
      numLists: 1,
      similarity: "COS",
      dimensions: 3072,
    },
  }
);

ImageSchema.index(
  { clipEmbedding: "cosmosSearch" },
  {
    cosmosSearchOptions: {
      kind: "vector-ivf",
      numLists: 1,
      similarity: "COS",
      dimensions: 512,
    },
  }
);

const Image = mongoose.model("Image", ImageSchema);
module.exports = Image;
