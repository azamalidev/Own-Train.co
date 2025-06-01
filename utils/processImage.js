const { createWorker } = require('tesseract.js');
const Image = require('../models/ImageSchema');
// const cloudinary = require("cloudinary").v2;

async function processImage(imageId, userId) {
  try {
    const image = await Image.findById(imageId);
    if (!image) throw new Error('Image not found');

    // 1. Extract text from image
    const { text, confidence } = await extractTextFromImage(image.path);
    console.log('Extracted text:', text, confidence);

    // 2. Generate basic labels from extracted text
    const dataFromApi = await generateLabelsWithGrok(text);
    const tags = dataFromApi.tags;
    const categories = dataFromApi.categories;
    console.log('data from Api is:', dataFromApi);
    console.log('Generated tags:', tags);

    const combinedText = [...tags, ...categories].join(' ');
    console.log(combinedText);
    // 3. Create embeddings from the text
    // const textEmbedding = await generateTextEmbedding(text);
    const textEmbedding = await generateTextEmbedding(combinedText);
    console.log('Generated text embedding', textEmbedding);

    // 4. Prepare text annotations
    const textAnnotations = [];
    if (text) {
      textAnnotations.push({
        text: text,
        confidence: confidence || 0.8, // Use OCR confidence or default
      });
    }
    console.log('Annotations', textAnnotations);
    console.log('Tags', tags);
    // 5. Update the image document
    const updateData = {
      textAnnotations,
      tags: tags.map((tag) => ({
        tag,
        confidence: 0.8,
        source: 'generated',
      })),
      categories,
      textEmbedding,
      status: 'processed',
      processedAt: new Date(),
      containsText: !!text,
    };

    console.log('Updated Data', updateData);
    await Image.findByIdAndUpdate(imageId, updateData);
    return true;
  } catch (error) {
    console.error('Image processing failed:', error);
    await Image.findByIdAndUpdate(imageId, {
      status: 'failed',
      processingError: error.message,
    });
    return false;
  }
}

const { exec } = require('child_process');
const path = require('path');

async function pythonExtract(imagePath) {
  // Convert paths to POSIX format (works across Windows/Linux)
  const scriptPath = path
    .join(__dirname, 'utils', 'ocr.py')
    .replace(/\\/g, '/');
  const normalizedImagePath = imagePath.replace(/\\/g, '/');

  return new Promise((resolve) => {
    exec(
      `python "${scriptPath}" "${normalizedImagePath}"`,
      (error, stdout, stderr) => {
        if (error) {
          console.error('Execution Error:', {
            error: error.message,
            cmd: error.cmd,
            path: process.env.PATH,
          });
          resolve({ success: false, error: 'OCR processing failed' });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          console.error('Parse Error:', { stdout, stderr });
          resolve({
            success: false,
            error: 'Invalid OCR output',
            debug: { stdout, stderr },
          });
        }
      }
    );
  });
}
// Simplified text extraction
async function extractTextFromImage(imagePath) {
  let worker;
  try {
    worker = await createWorker({
      logger: (m) => console.log(m), // Optional logging
      errorHandler: (err) => console.error(err),
    });

    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // Configure for better text extraction
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Assume a single uniform block of text
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?@#$%&*()-_=+[]{};:\'"\\|<>/ ', // Include space
      preserve_interword_spaces: '1',
    });

    const { data } = await worker.recognize(imagePath);

    // Clean the extracted text
    const cleanedText = cleanExtractedText(data.text);

    return {
      text: cleanedText,
      confidence: data.confidence,
    };
  } finally {
    if (worker) await worker.terminate().catch(console.error);
  }
}

function cleanExtractedText(rawText) {
  // Step 1: Remove unwanted characters and artifacts
  let cleaned = rawText
    .replace(/[^\w\s.,!?@#$%&*()\-_=+[\]{};:'"\\|<>/]/g, ' ') // Keep only allowed chars
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  // Step 2: Fix common OCR errors
  cleaned = cleaned
    .replace(/\b(\w)\s+(\w)\b/g, '$1$2') // Fix split words (e.g., "hel lo" -> "hello")
    .replace(/([a-z])\s+([A-Z])/g, '$1 $2') // Fix merged words
    .replace(/(\d)\s+(\d)/g, '$1$2'); // Fix split numbers

  // Step 3: Remove isolated single characters (likely OCR noise)
  cleaned = cleaned
    .split(' ')
    .filter((word) => word.length > 1 || /^[A-Za-z0-9]$/.test(word))
    .join(' ');

  return cleaned;
}

// Label generation (unchanged)
async function generateLabelsWithGrok(text) {
  if (!text) return { tags: [], categories: [] };

  try {
    // Prepare the prompt for Grok API
    const messages = [
      {
        role: 'system',
        content:
          'You are a helpful assistant that generates tags and categories for text content.',
      },
      {
        role: 'user',
        content: `Analyze the following text and generate appropriate tags and categories.
        Return ONLY a JSON object with "tags" and "categories" arrays.
        
        Text: "${text}"
        
        Guidelines:
        - use this data and let me give 10 all types of tags like broad, human language like that ensure what kind of data it is make sure the tags would be like as it will label their data
        - Tags should be lowercase, hyphenated-if-multiword
        - Example response: {"tags": ["tag1", "tag2"], "categories": ["category1"]}`,
      },
    ];

    // Make API call to Groq API
    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct', // or "llama2-70b-4096"
          messages: messages,
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 200,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Grok API error details:', errorData);
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Grok API response');
    }

    // Parse the JSON response
    try {
      const result = JSON.parse(content);

      // Validate the response structure
      if (!result.tags || !result.categories) {
        throw new Error('Invalid response structure from Grok API');
      }

      return {
        tags: Array.isArray(result.tags) ? result.tags : [],
        categories: Array.isArray(result.categories) ? result.categories : [],
      };
    } catch (e) {
      console.error('Failed to parse Grok response:', e);
      console.error('Response content:', content);
      return fallbackLabelGeneration(text);
    }
  } catch (error) {
    console.error('Error calling Grok API:', error);
    return fallbackLabelGeneration(text);
  }
}

// Fallback to basic implementation if Grok fails
function fallbackLabelGeneration(text) {
  // Your original implementation
  if (!text) return { tags: [], categories: [] };

  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 3);

  const stopWords = new Set(['the', 'and', 'that', 'this', 'with', 'which']);
  const wordCounts = {};

  words.forEach((word) => {
    if (!stopWords.has(word)) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  });

  const tags = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  const categories = [];
  const techWords = ['ai', 'machine', 'learning', 'model', 'api'];
  if (tags.some((tag) => techWords.includes(tag))) {
    categories.push('technology');
  }
  if (tags.length > 0) categories.push('general');

  return { tags, categories };
}

// Usage example
// generateLabelsWithGrok("Your text here").then(labels => console.log(labels));

// Embedding generation (unchanged)
async function generateTextEmbedding(text) {
  try {
    if (!text) return [];

    const { pipeline } = await import('@xenova/transformers');
    const extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );

    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data);
  } catch (error) {
    console.error('Embedding generation error:', error);
    return [];
  }
}

module.exports = { processImage };
