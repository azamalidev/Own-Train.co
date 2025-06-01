// controllers/chatController.js
const { findRelevantChunks } = require('../aiServices/vectorSearch');
const { embedQuery } = require('../aiServices/embeddingService');
const { generateResponse } = require('../aiServices/ollamaService');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const {
  askGroqWithContext,
  askGroqForSummary,
} = require('../aiServices/GrokAPI');
const findMatchedImages = require('../aiServices/findImages');
const { spawn } = require('child_process');
const { enrichWithOpenAI, summarizationWithOpenAI } = require('./enrichText');

// function runPython(inputText) {
//   console.log("Run python called");

//   const pythonScriptPath = path.join(__dirname, "query_preprocessor.py");
//   console.log("Python script path:", pythonScriptPath);

//   if (!fs.existsSync(pythonScriptPath)) {
//     console.error("File does not exist at path:", pythonScriptPath);
//     return Promise.reject("Python script not found");
//   }

//   return new Promise((resolve, reject) => {
//     const python = spawn("python", [pythonScriptPath, inputText]);
//     let data = "";

//     python.stdout.on("data", (chunk) => {
//       // console.log("Python output:", chunk.toString());
//       data += chunk.toString();
//     });

//     python.stderr.on("data", (err) => {
//       console.error("Python error:", err.toString());
//       reject(`Error: ${err}`);
//     });

//     python.on("close", () => {
//       try {
//         resolve(JSON.parse(data));
//       } catch (e) {
//         reject("Failed to parse output: " + e.message);
//       }
//     });
//   });
// }

async function handleChatQuery(req, res) {
  try {
    const { query, prevHistory, email, summaryState } = req.body;
    if (!query || typeof query !== 'string' || !Array.isArray(prevHistory)) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const adminId = req.user.admin;
    let existingSummary = summaryState?.updatedSummary || '';
    let lastSummarizedIndex = summaryState?.lastSummarizedIndex ?? -1;

    const { updatedSummary, newLastSummarizedIndex } =
      await updateSummaryWithNewMessages(
        existingSummary,
        prevHistory,
        lastSummarizedIndex
      );

    const finalQuery = await enrichWithOpenAI(query);
    const queryEmbedding = await embedQuery(finalQuery);
    const relevantChunks = await findRelevantChunks(
      queryEmbedding,
      10,
      adminId
    );
    const matchedImages = await findMatchedImages(adminId, queryEmbedding, 2);

    const context = relevantChunks
      .map(
        (chunk) =>
          `[Source: ${chunk.metadata?.originalFile || 'Unknown'}]\n${
            chunk.text
          }`
      )
      .join('\n\n---\n\n');

    if (matchedImages.length > 0) {
      return res.json({
        response: '',
        sources: null,
        matchedImages,
        summaryState: {
          updatedSummary,
          lastSummarizedIndex: newLastSummarizedIndex,
        },
      });
    }

    const responseObj = await askGroqWithContext(
      query,
      context,
      prevHistory,
      updatedSummary,
      newLastSummarizedIndex
    );

    const sources = relevantChunks.map((chunk) => ({
      fileId: chunk.file,
      chunkIndex: chunk.chunkIndex,
      filename: chunk.metadata?.originalFile || 'Unknown',
      score: chunk.score ? Number(chunk.score.toFixed(3)) : null,
    }));

    res.json({
      response: responseObj.answer,
      sources,
      matchedImages: [],
      summaryState: {
        updatedSummary: responseObj.updatedSummary,
        lastSummarizedIndex: responseObj.newLastSummarizedIndex,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to process query',
      details: error.message,
    });
  }
}
async function updateSummaryWithNewMessages(
  existingSummary,
  allMessages,
  lastIndex
) {
  const newMessages = allMessages.slice(lastIndex + 1);

  if (newMessages.length === 0) {
    return {
      updatedSummary: existingSummary,
      newLastSummarizedIndex: lastIndex,
    };
  }

  const formattedNewMessages = newMessages
    .map((msg) => `${msg.sender === 'user' ? 'User' : 'Bot'}: ${msg.text}`)
    .join('\n');

  const prompt = `Current Summary:\n${existingSummary}\n\nNew Messages:\n${formattedNewMessages}\n\nUpdate the summary accordingly.`;

  const updatedSummary = await askGroqForSummary(prompt);

  return {
    updatedSummary,
    newLastSummarizedIndex: allMessages.length - 1,
  };
}

module.exports = { handleChatQuery };
