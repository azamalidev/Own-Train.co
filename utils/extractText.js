const fs = require("fs");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const xlsx = require("xlsx");
// const { chunkText } = require("./textUtils");
// const { createEmbeddings } = require("./embeddingService");

// Individual extractor functions remain the same
const extractTextFromPdf = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdf(dataBuffer);
  console.log(pdfData);
  return pdfData.text;
};

const extractTextFromDocx = async (filePath) => {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
};

const { spawn } = require("child_process");
const path = require("path");

async function processExcel(filePath) {
  const pythonScriptPath = path.join(__dirname, "excel_processor.py");

  return new Promise((resolve, reject) => {
    const python = spawn("python", [pythonScriptPath, filePath]);

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0 || stderr) {
        return reject({
          error: "Python script failed",
          details: stderr || `Exited with code ${code}`,
        });
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (parseError) {
        reject({
          error: "Failed to parse JSON",
          details: parseError.message,
          rawOutput: stdout,
        });
      }
    });
  });
}

// Usage example
async function extractTextFromExcel(filePath) {
  try {
    const itemsArray = await processExcel(filePath);
    console.log("Successfully processed items:", itemsArray.length);
    console.log("Successfully processed items:", itemsArray);
    console.log("Stringified data", JSON.stringify(itemsArray));
    return JSON.stringify(itemsArray);
  } catch (error) {
    console.error("Error processing Excel:", error);
    return "";
  }
}

// Example usage
// extractExcelData('path/to/your/file.xlsx').then(result => {...});
const extractTextFromTxt = async (filePath) => {
  return fs.readFileSync(filePath, "utf-8");
};

// Main processing function - now handles single file or array of files
const extractAndProcessText = async (files) => {
  try {
    // Handle both single file and array input
    const filesArray = Array.isArray(files) ? files : [files];
    const results = [];

    for (const file of filesArray) {
      try {
        let text;

        switch (file.mimetype) {
          case "application/pdf":
            text = await extractTextFromPdf(file.path);
            break;
          case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            text = await extractTextFromDocx(file.path);
            break;
          case "application/vnd.ms-excel":
          case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            text = await extractTextFromExcel(file.path);
            break;
          case "text/plain":
            text = await extractTextFromTxt(file.path);
            break;
          default:
            throw new Error(`Unsupported file type: ${file.mimetype}`);
        }

        const textFilePath = path.join(
          path.dirname(file.path),
          `${file.storedName}.txt`
        );
        fs.writeFileSync(textFilePath, text);

        results.push({
          success: true,
          fileId: file._id,
          originalName: file.originalName,
          text: text,
          tempTextPath: textFilePath,
        });
      } catch (fileError) {
        results.push({
          success: false,
          fileId: file._id,
          originalName: file.originalName,
          error: fileError.message,
        });
      }
    }

    // For single file input, return single result (backward compatible)
    return Array.isArray(files) ? results : results[0];
  } catch (error) {
    throw new Error(`Text processing failed: ${error.message}`);
  }
};

module.exports = { extractAndProcessText };
