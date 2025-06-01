require('dotenv').config();
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');
const connectToMongoDbCluster = require('./utils/db');
const logger = require('./utils/logger');
const adminRoutes = require('./routes/adminRoutes');
const checkoutRoutes = require('./routes/paypal');
const userRoutes = require('./routes/userRoutes');
const express = require('express');
const app = express();
const feedbackRoutes = require('./routes/FeedbackRoutes');
const { initializeModel } = require('./utils/embeddingService');
const cookieParser = require('cookie-parser');
const userAuth = require('./middlewares/userAuth');
app.use(cookieParser());
// Enhanced CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:5000',
        'https://owntrain.co',
        'https://www.owntrain.co',
      ];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['set-cookie'],
  })
);

// Serve the 'uploads' folder statically
app.use('/uploads', express.static('uploads'));

// // Pre-loading during starting
// initializeModel().then(() => {
//   console.log("Embedding model ready");
//   app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
// });

//connection to db
connectToMongoDbCluster();

//default middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
//routes
// app.use("/user");
// app.use("/chat");

app.use('/admin', adminRoutes);
app.use('/checkout', checkoutRoutes);
app.use('/user', userRoutes);
console.log('gpoind from server');
app.use('/feedback', feedbackRoutes);
app.get('/', (req, res) => {
  res.send('🚀 Backend API is running!');
});

//middlewares -> auth middleware and error handler middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
});

//EDGE CASES

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
