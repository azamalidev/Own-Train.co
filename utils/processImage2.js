const { createWorker } = require("tesseract.js");
const sharp = require("sharp");
const axios = require("axios");
const Image = require("../models/ImageSchema");
const path = require("path");
const fs = require("fs");

// Initialize AI services
const API_KEY = "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";
const MODEL_NAME = "meta-llama/llama-4-scout-17b-16e-instruct";

async function processImage(imageId, userId) {
  console.log(`Starting image processing for ${imageId}`);
  let image;
  try {
    // Update status to processing
    image = await Image.findByIdAndUpdate(
      imageId,
      {
        status: "processing",
        processingStart: new Date(),
      },
      { new: true }
    );

    if (!image) throw new Error("Image not found");

    // Process steps with improved error handling and logging
    console.log("Starting image analysis");
    await analyzeImageMetadata(image);

    console.log("Starting text extraction");
    await extractTextFromImage(image);

    console.log("Starting computer vision analysis");
    await computerVisionAnalysis(image);

    console.log("Generating image description");
    await generateImageDescription(image);

    console.log("Generating tags and categories");
    await generateTagsAndCategories(image);

    console.log("Generating embeddings");
    await generateEmbeddings(image);

    console.log("Creating processed versions");
    await createProcessedVersions(image);

    // Final update
    console.log("Finalizing processing");
    await Image.findByIdAndUpdate(imageId, {
      status: "processed",
      processingTime: new Date() - image.processingStart,
      modelVersions: {
        vision: MODEL_NAME,
        text: MODEL_NAME,
        embedding: "all-MiniLM-L6-v2+clip-vit-base-patch16",
      },
    });

    console.log(`Successfully processed image ${imageId}`);
  } catch (error) {
    console.error(`Error processing image ${imageId}:`, error);
    await Image.findByIdAndUpdate(imageId, {
      status: "failed",
      processingError: error.message,
      processingTime: image?.processingStart
        ? new Date() - image.processingStart
        : 0,
    });
    throw error;
  }
}

// Enhanced Helper Functions with better error handling and resource management

async function analyzeImageMetadata(image) {
  try {
    console.log(`Analyzing metadata for image ${image._id}`);
    const metadata = await sharp(image.path).metadata();

    const update = {
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        colorProfile: metadata.icc || metadata.ifd0?.ICC_Profile || "sRGB",
        resolution: {
          dpi: metadata.density || 72,
          unit: metadata.densityUnit || "inch",
        },
      },
    };

    // Get dominant colors
    const { dominant } = await sharp(image.path).resize(100, 100).stats();
    update.metadata.dominantColors = [
      `rgb(${dominant.r},${dominant.g},${dominant.b})`,
    ];

    console.log("Updated meta data", update);
    await Image.findByIdAndUpdate(image._id, update);
  } catch (error) {
    console.error("Metadata analysis failed:", error);
    throw error;
  }
}

async function extractTextFromImage(image) {
  let worker;
  try {
    console.log(`Extracting text from image ${image._id}`);

    worker = await createWorker({
      cachePath: "./tesseract-cache", // Add cache for better performance
      errorHandler: (err) => console.error("Tesseract Error:", err),
    });

    await worker.loadLanguage("eng");
    await worker.initialize("eng");

    const {
      data: { text, hocr },
    } = await worker.recognize(image.path, {
      tessedit_pageseg_mode: 6, // Assume uniform block of text
      preserve_interword_spaces: 1, // Better for word boxes
    });

    const hasText = text && text.trim().length > 0;
    const annotations = hasText ? parseHOCR(hocr) : [];

    await Image.findByIdAndUpdate(image._id, {
      containsText: hasText,
      textAnnotations: annotations,
      "metadata.hasText": hasText,
    });
    console.log("Text form image", hasText);
    return hasText;
  } catch (error) {
    console.error("Text extraction failed:", error);
    await Image.findByIdAndUpdate(image._id, {
      containsText: false,
      textAnnotations: [],
      "metadata.hasText": false,
    });
    return false;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.error("Worker termination error:", terminateError);
      }
    }
  }
}
function parseHOCR(hocr) {
  const annotations = [];
  if (!hocr) return annotations;

  // Improved regex patterns
  const wordRegex =
    /<span class=['"]ocrx_word['"][^>]*title=['"]bbox (\d+) (\d+) (\d+) (\d+)['"][^>]*>([^<]*)<\/span>/gi;
  const confidenceRegex = /x_wconf (\d+)/;

  let match;
  while ((match = wordRegex.exec(hocr)) !== null) {
    try {
      const confidenceMatch = confidenceRegex.exec(match[0]);
      const confidence = confidenceMatch
        ? parseInt(confidenceMatch[1]) / 100
        : 0.8; // Default confidence

      annotations.push({
        text: match[5].trim(),
        confidence,
        boundingBox: {
          vertices: [
            { x: parseInt(match[1]), y: parseInt(match[2]) },
            { x: parseInt(match[3]), y: parseInt(match[2]) },
            { x: parseInt(match[3]), y: parseInt(match[4]) },
            { x: parseInt(match[1]), y: parseInt(match[4]) },
          ],
        },
      });
    } catch (parseError) {
      console.error("Error parsing HOCR word:", parseError);
    }
  }

  return annotations;
}

async function computerVisionAnalysis(image) {
  try {
    console.log(`Starting vision analysis for image ${image._id}`);

    // Validate image exists
    if (!fs.existsSync(image.path)) {
      throw new Error("Image file not found");
    }

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: MODEL_NAME,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image in detail. Identify objects, scenes, activities, and notable features. Assess aesthetic quality, mood, and style.",
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 seconds timeout
      }
    );

    const analysis = response.data.choices[0].message.content;
    const structuredData = parseVisionAnalysis(analysis);

    await Image.findByIdAndUpdate(image._id, structuredData);
  } catch (error) {
    console.error("Vision analysis failed:", error);
    throw error;
  }
}

function parseVisionAnalysis(analysisText) {
  const result = {
    sceneType: "",
    aestheticScore: 0.7,
    mood: "",
    style: "",
    containsFaces: false,
    faceCount: 0,
    detailedDescription: analysisText,
  };

  // Improved parsing logic
  const lowerText = analysisText.toLowerCase();

  // Scene type detection
  if (lowerText.includes("landscape")) result.sceneType = "landscape";
  else if (lowerText.includes("portrait")) result.sceneType = "portrait";
  else if (lowerText.includes("abstract")) result.sceneType = "abstract";

  // Mood detection
  if (lowerText.includes("serene") || lowerText.includes("calm"))
    result.mood = "serene";
  else if (lowerText.includes("dramatic")) result.mood = "dramatic";
  else if (lowerText.includes("chaotic")) result.mood = "chaotic";

  // Style detection
  if (lowerText.includes("photorealistic")) result.style = "photorealistic";
  else if (lowerText.includes("painting")) result.style = "painting";
  else if (lowerText.includes("sketch")) result.style = "sketch";

  // Face detection
  const faceMatch = analysisText.match(/(\d+) faces?/i);
  if (faceMatch) {
    result.containsFaces = true;
    result.faceCount = parseInt(faceMatch[1]);
  }

  // Quality assessment
  if (lowerText.includes("excellent") || lowerText.includes("high quality")) {
    result.aestheticScore = 0.9;
  } else if (lowerText.includes("poor") || lowerText.includes("low quality")) {
    result.aestheticScore = 0.4;
  }

  return result;
}

async function generateImageDescription(image) {
  try {
    console.log(`Generating description for image ${image._id}`);
    const extractedText =
      image.textAnnotations?.map((a) => a.text).join(" ") || "";

    const prompt = `Create a detailed description (100-150 words) and a concise caption (10-15 words) for this image based on:
    Visual Analysis: ${image.detailedDescription}
    Extracted Text: ${extractedText}`;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: MODEL_NAME,
        messages: [
          {
            role: "system",
            content: "Generate accurate and concise image descriptions.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1024,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const content = response.data.choices[0].message.content;
    const [caption, ...descriptionParts] = content.split("\n");
    const description = descriptionParts.join("\n");

    await Image.findByIdAndUpdate(image._id, {
      generatedCaption: caption.replace("Caption:", "").trim(),
      detailedDescription: description.replace("Description:", "").trim(),
    });
  } catch (error) {
    console.error("Description generation failed:", error);
    throw error;
  }
}

async function generateTagsAndCategories(image) {
  try {
    console.log(`Generating tags for image ${image._id}`);

    // Create a more structured prompt
    const prompt = `Analyze this image description and generate:
    1. 5-10 specific tags (comma-separated)
    2. 2-3 general categories (comma-separated)
    
    Image Description: ${image.detailedDescription}
    Extracted Text: ${
      image.textAnnotations?.map((a) => a.text).join(" ") || "None"
    }
    
    Return JSON format: {tags: string[], categories: string[]}`;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: MODEL_NAME,
        messages: [
          {
            role: "system",
            content:
              "You are an expert at generating accurate image tags and categories.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3, // Lower temperature for more consistent results
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const result = JSON.parse(response.data.choices[0].message.content);

    // Ensure we always have arrays
    const tags = Array.isArray(result.tags) ? result.tags : [];
    const categories = Array.isArray(result.categories)
      ? result.categories
      : [];

    // Add confidence scores
    const formattedTags = tags.map((tag) => ({
      tag: tag.trim(),
      confidence: 0.85,
      source: "generated",
    }));

    // Add OCR tags if text exists
    if (image.containsText && image.textAnnotations?.length) {
      const textTags = extractKeywordsFromText(
        image.textAnnotations.map((a) => a.text).join(" ")
      );
      textTags.forEach((tag) => {
        if (
          !formattedTags.some((t) => t.tag.toLowerCase() === tag.toLowerCase())
        ) {
          formattedTags.push({
            tag,
            confidence: 0.75,
            source: "ocr",
          });
        }
      });
    }

    await Image.findByIdAndUpdate(image._id, {
      tags: formattedTags,
      categories: categories.map((c) => c.trim()).filter((c) => c),
    });
  } catch (error) {
    console.error("Tag generation failed:", error);
    // Set default values if API fails
    await Image.findByIdAndUpdate(image._id, {
      tags: [],
      categories: [],
    });
    throw error;
  }
}
function extractKeywordsFromText(text) {
  const words = text.toLowerCase().split(/\s+/);
  const stopWords = new Set([
    "the",
    "and",
    "a",
    "an",
    "in",
    "on",
    "at",
    "to",
    "for",
  ]);

  return [
    ...new Set(
      words
        .filter((word) => word.length > 3 && !stopWords.has(word))
        .slice(0, 5)
    ),
  ];
}

async function generateEmbeddings(image) {
  try {
    console.log(`Generating embeddings for image ${image._id}`);
    const { pipeline } = await import("@xenova/transformers");

    // 1. First ensure the image exists and is readable
    if (!fs.existsSync(image.path)) {
      throw new Error("Image file not found");
    }

    // 2. Pre-process the image to standard format
    const processedImagePath = `${image.path}_processed.jpg`;
    await sharp(image.path)
      .resize(224, 224) // CLIP typically expects this size
      .toFormat("jpeg")
      .toFile(processedImagePath);

    // 3. Generate text embedding
    const textExtractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );

    const textEmbedding = await generateTextEmbedding(textExtractor, image);

    // 4. Generate image embedding with error handling
    let clipEmbedding = [];
    try {
      const clipExtractor = await pipeline(
        "feature-extraction",
        "Xenova/clip-vit-base-patch16"
      );
      const imageOutput = await clipExtractor(processedImagePath, {
        pooling: "mean",
        normalize: true,
      });
      clipEmbedding = Array.from(imageOutput.data);
    } catch (clipError) {
      console.error("CLIP embedding failed, using text only:", clipError);
      // Fallback to empty array if image embedding fails
    }

    // 5. Clean up and save
    fs.unlinkSync(processedImagePath); // Remove temp file

    await Image.findByIdAndUpdate(image._id, {
      textEmbedding,
      clipEmbedding,
      embeddingModel: "all-MiniLM-L6-v2+clip-vit-base-patch16",
    });
  } catch (error) {
    console.error("Embedding generation failed:", error);
    await Image.findByIdAndUpdate(image._id, {
      textEmbedding: [],
      clipEmbedding: [],
    });
    throw error;
  }
}

async function generateTextEmbedding(extractor, image) {
  const descriptionText =
    image.detailedDescription ||
    image.generatedCaption ||
    image.originalName ||
    "Image";

  const embeddingText = [
    `Description: ${descriptionText}`,
    `Tags: ${image.tags?.map((t) => t.tag).join(", ") || "None"}`,
    `Categories: ${image.categories?.join(", ") || "None"}`,
  ].join("\n");

  const output = await extractor(embeddingText, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(output.data);
}
async function createProcessedVersions(image) {
  try {
    console.log(`Creating processed versions for image ${image._id}`);
    const dir = path.dirname(image.path);
    const baseName = path.basename(image.path, path.extname(image.path));

    const processedPath = path.join(dir, `${baseName}_processed.webp`);
    const thumbnailPath = path.join(dir, `${baseName}_thumb.webp`);

    await Promise.all([
      sharp(image.path)
        .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(processedPath),
      sharp(image.path)
        .resize(300, 300, { fit: "cover" })
        .webp({ quality: 70 })
        .toFile(thumbnailPath),
    ]);

    await Image.findByIdAndUpdate(image._id, {
      processedPath,
      thumbnailPath,
    });
  } catch (error) {
    console.error("Processed versions creation failed:", error);
    throw error;
  }
}

module.exports = { processImage };
