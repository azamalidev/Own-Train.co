const fs = require("fs");
const path = require("path");
const TextChunk = require("../models/TextChunkSchema");

const deleteFileChunks = async (fileId) => {
  try {
    // Delete all chunks associated with the file
    await TextChunk.deleteMany({ file: fileId });

    // Optional: Delete the processed text file
    const file = await File.findById(fileId);
    if (file) {
      const textFilePath = path.join(
        path.dirname(file.path),
        `${file.storedName}.txt`
      );
      if (fs.existsSync(textFilePath)) {
        fs.unlinkSync(textFilePath);
      }
    }

    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    console.error("Error deleting file chunks:", error);
    throw error;
  }
};

module.exports = { deleteFileChunks };
