const { Ollama } = require("ollama");
const logger = require("../utils/logger");
const { TextEncoder, TextDecoder } = require("util");

// Configure Ollama
const ollama = new Ollama({
  baseUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  timeout: 180000,
  request: {
    retries: 3,
    retryDelay: (retryCount) => Math.pow(2, retryCount) * 1000,
  },
});

const MODEL_CONFIG = {
  model: "llama2:latest",
  options: {
    temperature: 0.3,
    num_ctx: 2048,
    num_predict: 1000, //output configuration
    num_thread: 8,
  },
};

const MAX_CONTEXT_BYTES = 6144;

// Trim context to fit within token limit
// function trimContext(text) {
//   if (!text) return "";
//   try {
//     const encoder = new TextEncoder();
//     const decoder = new TextDecoder();
//     const encoded = encoder.encode(text);
//     return decoder.decode(encoded.slice(0, MAX_CONTEXT_BYTES));
//   } catch (error) {
//     logger.error("Context trimming failed:", error);
//     return text.substring(0, Math.floor(MAX_CONTEXT_BYTES / 2));
//   }
// }
function trimContext(text) {
  if (!text) return "";
  try {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);

    if (encoded.length <= MAX_CONTEXT_BYTES) return text;

    const trimmed = encoded.slice(0, MAX_CONTEXT_BYTES);

    // Decode while avoiding partial multibyte character
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(trimmed);
  } catch (error) {
    logger.error("Context trimming failed:", error);
    return text.substring(0, Math.floor(MAX_CONTEXT_BYTES / 2));
  }
}

// Prompt engineering
function buildLlama2Prompt(context, query) {
  return `<s>[INST] <<SYS>>
You are an intelligent, friendly, and context-aware assistant. Follow these rules:

1. **Adapt Tone to the User**: Be professional in formal settings, friendly and casual in general conversation, and empathetic in sensitive contexts.
2. **Answer Type Matching**: 
   - For greetings, respond in a warm and human-like manner.
   - For information queries, give accurate, concise, and clear responses.
   - For complex questions, offer structured answers using markdown headings and bullet points.
3. **Context Use**: When context is provided, incorporate it logically to improve relevance.
4. **Fallback Gracefully**: If the question lacks enough detail, provide a helpful guess or ask clarifying questions.
5. **Always Be Conversational**: Avoid sounding robotic. Use natural language, contractions, and everyday phrasing.
6. **Support Variety**: Capable of handling anything from casual chat to technical explanations or creative writing.

CONTEXT:
${context}
<</SYS>>

QUESTION: ${query}
ANSWER:
`;
}

// Core generation logic
async function generateResponse(query, context) {
  const startTime = Date.now();
  try {
    if (!query?.trim() || !context?.trim()) {
      throw new Error(
        `Invalid inputs - Query: ${query?.length} chars, Context: ${context?.length} chars`
      );
    }

    const modelAvailable = await Promise.race([
      isModelAvailable(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Model check timeout")), 5000)
      ),
    ]);

    if (!modelAvailable) {
      throw new Error(
        `Model ${MODEL_CONFIG.model} not available or not running`
      );
    }

    logger.info("Using model:", MODEL_CONFIG.model);

    const trimmedContext = trimContext(context);
    const prompt = buildLlama2Prompt(trimmedContext, query);
    logger.debug("Full generation prompt:\n" + prompt);

    let fullText = "";
    const response = await ollama.chat({
      ...MODEL_CONFIG,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });

    for await (const chunk of response) {
      console.log(chunk);
      if (chunk?.message?.content) {
        fullText += chunk.message.content;
      }
    }

    logger.info(`Final stream size: ${fullText.length} characters`);

    // ✅ This is the part that was likely missed or bugged
    if (!fullText || fullText.trim().length < 10) {
      throw new Error("Received incomplete or empty response from model");
    }
    const cleanedResponse = cleanResponse(fullText);
    logger.info(`Generation successful in ${Date.now() - startTime}ms`);

    return cleanedResponse;
  } catch (error) {
    logger.error("Generation Failure Details:", {
      error: error.message,
      stack: error.stack,
      queryPreview: query?.substring(0, 50),
      contextPreview: context?.substring(0, 100),
      duration: Date.now() - startTime,
    });

    return `🚨 Unable to generate response (Error: ${
      error.code || "INTERNAL"
    })\n\n**Technical Details**:\n- ${
      error.message
    }\n- Please try again later.`;
  }
}

// Clean up response formatting
function cleanResponse(text) {
  return text
    .replace(/<\/?(INST|SYS)[^>]*>/gi, "")
    .replace(/(```markdown|```html)/gi, "```")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Check if model is running
async function isModelAvailable() {
  try {
    const { models } = await ollama.list();
    return models.some((m) => m.name === "llama2:latest");
  } catch (error) {
    logger.error("Model Check Failed:", error);
    return false;
  }
}

module.exports = {
  generateResponse,
  MODEL_CONFIG,
};
