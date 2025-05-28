const File = require('../models/FileSchema');
const Image = require('../models/ImageSchema');
const TextChunk = require('../models/TextChunkSchema');
const fs = require('fs');
const path = require('path');
const { extractAndProcessText } = require('../utils/extractText');
const { createEmbeddings } = require('../utils/embeddingService');
const { chunkText } = require('../utils/textUtils');
const logger = require('../utils/logger');
const { processImage } = require('../utils/processImage');
const { enrichWithOpenAI } = require('./enrichText');

const Subscription = require('../models/subscription');

const MIN_CHUNK_SIZE = 500; // Minimum chunk size to keep
const MAX_CHUNK_SIZE = 1500; // Maximum chunk size allowed
// const cosineSimilarity = require("../utils/similarity");

// Single file upload handler
const uploadFile = async (req, res) => {
  try {
    console.log(req.admin);
    console.log(req.file);
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = new File({
      originalName: req.file.originalname,
      storedName: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      user: req.admin._id,
      status: 'uploaded',
    });
    console.log('New file:', file);
    await file.save();
    processFile(file._id); // Background processing

    res.status(201).json({
      message: 'File uploaded successfully',
      fileId: file._id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Multiple files upload handler

const uploadFiles = async (req, res) => {
  try {
    const adminSubscription = await Subscription.findOne({
      userId: req.admin._id,
    });

    if (!adminSubscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // Expiry check - 1 month from creation
    const createdAt = new Date(adminSubscription.createdAt);
    const expiryDate = new Date(createdAt);
    expiryDate.setMonth(expiryDate.getMonth() + 1);
    const isExpired = new Date() > expiryDate;

    // Handle Business Plan restriction
    if (adminSubscription.planName === 'Business Plan') {
      if (isExpired) {
        return res.status(403).json({
          error: 'Business Plan has expired.Please upgrade your plan',
        });
      }

      if (adminSubscription.useDataStore >= adminSubscription.maxDataStore) {
        return res.status(403).json({
          error: 'Data storage limit exceeded.Please upgrade your plan',
        });
      }
    }

    // Handle Free Plan restriction
    if (adminSubscription.planName === 'Free Plan') {
      if (isExpired) {
        return res.status(403).json({ error: 'Free Plan has expired.Please upgrade the plan' });
      }
      if (adminSubscription?.maxFile == 5 || adminSubscription?.maxFile >= 5) {
        return res
          .status(403)
          .json({ error: 'Free plan allows only 5 file uploads. Please upgrade the plan' });
      } 
    }

    // No files uploaded check
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    let totalBytes = 0;

    const filePromises = req.files.map(async (uploadedFile) => {
      totalBytes += uploadedFile.size;

      if (uploadedFile.mimetype.startsWith('image/')) {
        const image = new Image({
          originalName: uploadedFile.originalname,
          storedName: uploadedFile.filename,
          path: uploadedFile.path,
          size: uploadedFile.size,
          mimetype: uploadedFile.mimetype,
          user: req.admin._id,
          status: 'uploaded',
          ...(req.admin.role === 'admin' && {
            isAdminUpload: true,
          }),
        });

        await image.save();
        processImage(image._id, image.user);
        return { id: image._id, type: 'image' };
      } else {
        const file = new File({
          originalName: uploadedFile.originalname,
          storedName: uploadedFile.filename,
          path: uploadedFile.path,
          size: uploadedFile.size,
          mimetype: uploadedFile.mimetype,
          user: req.admin._id,
          status: 'uploaded',
        });

        await file.save();
        await processFile(file._id, file.user);
        return file._id;
      }
    });

    const fileIds = await Promise.all(filePromises);

    const usedGB = totalBytes / 1024 ** 3; // bytes to GB

    if (adminSubscription?.planName == 'Business Plan') {
      // Update useDataStore
      adminSubscription.useDataStore = +(
        adminSubscription.useDataStore + usedGB
      ); // round to 3 decimals
      await adminSubscription.save();
    }
    if (adminSubscription?.planName == 'Free Plan') {
      adminSubscription.maxFile = adminSubscription.maxFile + 1; // round to 3 decimals
      await adminSubscription.save();
    }

    res.status(201).json({
      message: 'Files uploaded successfully',
      fileIds,
      count: fileIds.length,
      usedGB: usedGB.toFixed(3),
      updatedUsage: adminSubscription.useDataStore,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

const getSubscribePlan = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res
        .status(400)
        .json({ message: 'Missing userId in query parameters' });
    }

    const subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    res.status(200).json({
      message: 'Subscription fetched successfully',
      data: subscription,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: error.message });
  }
};

const processFile = async (fileId, user) => {
  console.log('Starting processing for file ID:', fileId);
  let file;

  try {
    file = await File.findById(fileId).lean();
    if (!file) {
      console.error(`File not found with ID: ${fileId}`);
      return;
    }

    console.log('Found file:', {
      id: file._id.toString(),
      name: file.originalName,
      status: file.status,
    });

    await File.updateOne({ _id: fileId }, { status: 'processing' });
    const rawText = await extractAndProcessText(file);

    if (
      file.mimetype == 'application/vnd.ms-excel' ||
      file.mimetype ==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      console.log('data recieved is : ', rawText);
      const JsonData = JSON.parse(rawText.text);
      console.log('JsonData', JsonData);
      try {
        const processingPromises = JsonData.map(async (obj, index) => {
          try {
            const textData = JSON.stringify(obj);
            console.log('Text data', textData);

            const enrichData = await enrichWithOpenAI(textData);
            console.log('Enrich Data', enrichData);
            const embeddings = await createEmbeddings(enrichData);
            console.log('embedings', embeddings, typeof embeddings);
            if (!embeddings) throw new Error('Embedding failed');

            const chunk = new TextChunk({
              file: fileId,
              user: user,
              chunkIndex: index,
              text: enrichData,
              embedding: embeddings,
              metadata: {
                originalFile: file.originalName,
                fileType: file.mimetype,
                isRetrievable: true,
              },
            });
            await chunk.save();
            console.log(`Chunk ${index + 1} saved successfully`);

            return chunk;
          } catch (error) {
            console.error(`Error processing chunk ${index + 1}:`, error);
            return null;
          }
        });
        const results = await Promise.all(processingPromises);
        console.log(`Saved text chunks`);
        return results.filter((r) => r !== null);
      } catch (error) {
        console.error('Global processing error:', error);
        return [];
      }
    } else {
      console.log(`Extracted text (${rawText.text.length} chars)`);
      console.log('Raw text generated is : ', rawText);

      //2. Clean text before chunking
      const cleanText = (txt) => {
        txt = txt.replace(/\s+/g, ' ');
        txt = txt.replace(/^\s*Page \d+\s*$/gm, '');
        return txt.trim();
      };

      const cleaned = cleanText(rawText.text);
      console.log('Cleaned text length:', cleaned.length);

      //3. Chunk cleaned text
      const chunks = await chunkText(cleaned);
      console.log(`Created ${chunks.length} chunks`);

      //4. Filter out bad/test chunks
      const validChunks = chunks.filter((chunk) => {
        const text = chunk.text;
        return (
          text.length > 30 &&
          !text.includes('User Prompt') &&
          /\w{3,}/.test(text)
        );
      });
      console.log('Valid Chunks', validChunks);
      const enrichedChunks = await Promise.all(
        validChunks.map(async (chunk) => {
          const enrichedText = await enrichWithOpenAI(chunk.text);
          return { ...chunk, text: enrichedText };
        })
      );
      console.log('Enriched chunks', enrichedChunks);
      console.log(`Valid chunks after filtering: ${enrichedChunks.length}`);

      //5. Generate embeddings only for valid chunks

      const embeddings = await createEmbeddings(enrichedChunks);

      //6. Prepare documents for DB
      const chunkDocuments = enrichedChunks.map((chunk, index) => ({
        file: fileId,
        user: user,
        chunkIndex: index,
        text: chunk.text,
        embedding: embeddings[index],
        metadata: {
          originalFile: file.originalName,
          fileType: file.mimetype,
          isRetrievable: true,
        },
      }));
      console.log('Chunk docLength', chunkDocuments.length);
      await TextChunk.insertMany(chunkDocuments);
      console.log(`Saved ${chunkDocuments.length} text chunks`);
    }
    //7. Update file status
    await File.updateOne({ _id: fileId }, { status: 'processed' });
    console.log(`Successfully processed file ${fileId}`);
  } catch (error) {
    console.error(`Processing failed for file ${fileId}:`, error);
    if (file) {
      await File.updateOne({ _id: fileId }, { status: 'failed' });
    }
  }
};

// Single File Deletion
const deleteFileData = async (req, res) => {
  try {
    const fileId = req.params.fileId;

    // 1. Delete associated text chunks
    await TextChunk.deleteMany({ file: fileId });

    // 2. Get file record before deletion

    const file = await File.findOne(fileId);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 3. Delete file record
    await File.findOneAndDelete(fileId);

    // 4. Remove physical file
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error(`Error deleting file ${file.path}:`, err);
      }
    }

    res.status(200).json({
      message: 'File deleted successfully',
      fileId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Multiple Files Deletion
const deleteMultipleFiles = async (req, res) => {
  try {
    const { fileIds } = req.body;

    console.log('fileIds', fileIds);

    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'Invalid file IDs provided' });
    }

    // 1. Delete chunks
    await TextChunk.deleteMany({ file: { $in: fileIds } });

    // 2. Get file records before deletion
    const files = await File.find({ _id: { $in: fileIds } });

    // 3. Delete file records
    await File.deleteMany({ _id: { $in: fileIds } });

    // 4. Remove physical files
    files.forEach((file) => {
      if (file?.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error(`Error deleting file ${file.path}:`, err);
        }
      }
    });

    res.status(200).json({
      message: 'Files deleted successfully',
      count: files.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Single File Search
const searchFile = async (req, res) => {
  try {
    const { fileId, query, limit = 10 } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    // 1. Embed the query
    const [queryEmbedding] = await createEmbeddings([query]);

    // 2. Find relevant chunks from the specified file
    const chunks = await TextChunk.find({ file: fileId });

    // 3. Rank by similarity
    const results = chunks
      .map((chunk) => ({
        text: chunk.text,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
        chunkIndex: chunk.chunkIndex,
        fileId: chunk.file,
        metadata: chunk.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.json({
      results,
      count: results.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Multiple Files Search
const searchMultipleFiles = async (req, res) => {
  try {
    const { fileIds, query, limit = 10 } = req.body;

    if (!fileIds || !Array.isArray(fileIds)) {
      return res.status(400).json({ error: 'Invalid file IDs provided' });
    }

    // 1. Embed the query
    const [queryEmbedding] = await createEmbeddings([query]);

    // 2. Find relevant chunks from all specified files
    const chunks = await TextChunk.find({ file: { $in: fileIds } });

    // 3. Rank by similarity
    const results = chunks
      .map((chunk) => ({
        text: chunk.text,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
        chunkIndex: chunk.chunkIndex,
        fileId: chunk.file,
        metadata: chunk.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.json({
      results,
      count: results.length,
      searchedFiles: fileIds.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all files from database
const getAllFiles = async (req, res) => {
  try {
    const id = req.admin._id;
    console.log(id);
    // const files = await File.find({
    //   email: { $regex: new RegExp(`^${email}$`, "i") },
    // });
    const files = await File.find({ user: id });
    // .populate("admin", "clientname email") // Optional: populate user details
    // .sort({ createdAt: -1 }); // Sort by newest first
    res.status(200).json({
      success: true,
      count: files.length,
      data: files,
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching files',
      error: error.message,
    });
  }
};

//Get single file by the id
const getFileById = async (req, res) => {
  //id will get from the url
  const id = req.params.id;

  //find in the database
  const file = await File.findById({ _id: id });
  if (file) {
    res.status(200).json({
      message: 'success',
      fileData: file,
    });
  } else {
    res.status(400).json({
      message: false,
      fileData: 'No file found',
    });
  }
};

// Get files by status (optional)
const getFilesByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const files = await File.find({ status })
      .populate('user')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: files.length,
      data: files,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error fetching ${status} files`,
      error: error.message,
    });
  }
};

module.exports = {
  getSubscribePlan,
  uploadFile,
  uploadFiles,
  deleteFileData,
  deleteMultipleFiles,
  searchFile,
  searchMultipleFiles,
  processFile,
  getAllFiles,
  getFileById,
  getFilesByStatus,
};
