const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: [true, 'userId  is required'],
  },

  planName: {
    type: String,
    required: [true, 'Subscription name is required'],
  },

  link: {
    type: String,
    required: [true, 'Link name is required'],
  },

  maxFile: {
    type: Number,
    required: [false, 'maxFile  is required'],
  },

   maxDataStore: {
    type: Number,
    required: [false, 'maxDataStore is required'],
  },

    useDataStore: {
    type: Number,
    required: [false, 'maxDataStore is required'],
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  price: {
    type: Number,
    required: [true, 'Subscription price is required'],
  },

  isActive: {
    type: Boolean,
    required: [true, 'Subscription status  is required'],
  },
  features: {
    type: [String],
    default: [],
  },
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);
module.exports = Subscription;
