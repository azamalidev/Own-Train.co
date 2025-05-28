// controllers/chatController.js
const { findRelevantChunks } = require("../aiServices/vectorSearch");
const { embedQuery } = require("../aiServices/embeddingService");
const { generateResponse } = require("../aiServices/ollamaService");
const logger = require("../utils/logger");
const path = require("path");
const fs = require("fs");
const { askGroqWithContext } = require("../aiServices/GrokAPI");
const findMatchedImages = require("../aiServices/findImages");
const { spawn } = require("child_process");
const { enrichWithOpenAI } = require("./enrichText");

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
    console.log("Hanlde user query");

    const { query, prevHistory } = req.body;
    // console.log("history Value", prevHistory);
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Invalid query input" });
    }
    // console.log("User got from the middleware", req.user.admin);
    const adminId = req.user.admin;

    // let finalQuery = await runPython(query);
    // console.log("final query", finalQuery.sentences[0].processed_query);
    // finalQuery = finalQuery.sentences[0].processed_query;
    // console.log("Query", query);
    let finalQuery = await enrichWithOpenAI(query);
    // console.log(finalQuery);
    // 1. Embed the user query
    const queryEmbedding = await embedQuery(finalQuery);
    logger.info("Query embedded successfully", {
      dims: queryEmbedding.length,
      sample: queryEmbedding.slice(0, 3), // Show first 3 elements for verification
    });

    // console.log("queryEmbeding", queryEmbedding);

    // 2. Find relevant chunks
    const relevantChunks = await findRelevantChunks(
      queryEmbedding,
      10,
      adminId
    );
    if (!relevantChunks.length) {
      logger.warn("No relevant chunks found", {
        query: query.substring(0, 50),
      });

      // return res.status(404).json({ message: "No relevant information found" });
    }

    console.log("Start finding images");
    const matchedImages = await findMatchedImages(adminId, queryEmbedding, 2);
    // console.log("Macthed Results ", matchedImages);
    // console.log("Fetching images finished");
    // console.log("Relevent Chunks Recieved", relevantChunks);
    // 3. Prepare context with proper error handling for metadata
    const context = relevantChunks
      .map((chunk) => {
        const source = chunk.metadata?.originalFile || "Unknown source";
        return `[Source: ${source}]\n${chunk.text}`;
      })
      .join("\n\n---\n\n");

    console.log("Created Context", context);

    if (matchedImages.length > 0) {
      console.log("If called");
      res.json({
        response: "",
        sources: null,
        matchedImages,
      });
    } else {
      console.log("Else called");
      // 4. Generate response
      // const response = await generateResponse(query, context);
      const response = await askGroqWithContext(query, context, prevHistory);
      console.log("response", response);

      // 5. Format response with scores
      const sources = relevantChunks.map((chunk) => ({
        fileId: chunk.file,
        chunkIndex: chunk.chunkIndex,
        filename: chunk.metadata?.originalFile || "Unknown",
        score: chunk.score ? Number(chunk.score.toFixed(3)) : null,
      }));

      res.json({
        response: response.trim(),
        sources,
        matchedImages,
      });
    }
  } catch (error) {
    console.log(error);
    logger.error("Chat processing failed:", {
      error: error.message,
      query: req.body.query?.substring(0, 50) || "Empty query",
    });
    res.status(500).json({
      error: "Failed to process query",
      ...(process.env.NODE_ENV === "development" && {
        details: error.message,
        stack: error.stack,
      }),
    });
  }
}

module.exports = { handleChatQuery };
