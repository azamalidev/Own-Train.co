const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const natural = require("natural");
const tokenizer = new natural.SentenceTokenizer();

// Configuration
const CHUNK_SIZE = 1000; // Target chunk size in characters
const OVERLAP = 200; // Overlap size in characters
const MIN_CHUNK_SIZE = 500; // Minimum chunk size to keep
const MAX_CHUNK_SIZE = CHUNK_SIZE + OVERLAP; // Maximum chunk size allowed

/**
 * Optimized chunking function that creates semantically meaningful chunks
 * @param {string} text - The input text to chunk
 * @param {Object} metadata - Metadata to attach to chunks
 * @returns {Array} Array of chunks with metadata
 */
const chunkText = async (text, metadata = {}) => {
  // First pass: Split by paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  let chunks = [];
  let currentChunk = "";

  // Process paragraphs into chunks
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed max size, finalize current chunk
    if (
      currentChunk.length + paragraph.length > MAX_CHUNK_SIZE &&
      currentChunk.length >= MIN_CHUNK_SIZE
    ) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }

    // Add paragraph to current chunk with spacing
    currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
  }

  // Add the last chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Second pass: Split any remaining large chunks recursively
  const finalChunks = [];
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: OVERLAP,
    separators: ["\n\n", "\n", ". ", "? ", "! ", " ", ""],
  });

  for (const chunk of chunks) {
    if (chunk.length <= MAX_CHUNK_SIZE) {
      finalChunks.push(chunk);
    } else {
      const subChunks = await splitter.splitText(chunk);
      finalChunks.push(...subChunks);
    }
  }

  const isJunkChunk = (text) => {
    return (
      text.includes("User Prompt") ||
      text.match(/User\s+Prompt\s+\d+/i) ||
      text.split(/\s+/).length < 5
    );
  };
  // Prepare chunks with metadata for database
  return finalChunks
    .map((text, index) => ({
      text,
      chunkIndex: index,
      isRetrievable: !isJunkChunk(text),
      metadata: {
        ...metadata,
        chunkSize: text.length,
        sentenceCount: tokenizer.tokenize(text).length,
      },
    }))
    .filter((chunk) => chunk.isRetrievable);
};

module.exports = { chunkText };
