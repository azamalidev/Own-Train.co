const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  clientname: {
    type: String,
    required: [true, 'Client name is required'],
    unique: true,
    trim: true,
  },
  verification: {
    type: Boolean,
    required: [false, 'Region is not required'],
  },
  otp: {
    type: String,
    required: [false, 'otp is not required'],
  },
  plan: {
    type: String,
    required: [true, 'plan is required'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(v);
      },
      message: (props) => `${props.value} is not a valid email!`,
    },
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
  },
  region: {
    type: String,
    required: [true, 'Region is required'],
    trim: true,
  },
  companyname: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true,
  },
  companyurl: {
    type: String,
    required: [true, 'Company URL is required'],
    trim: true,
  },
  telephone: {
    type: Number,
    required: [true, 'Telephone is required'],
    validate: {
      validator: function (v) {
        return /^\d{10,15}$/.test(v.toString());
      },
      message: (props) => `${props.value} is not a valid phone number!`,
    },
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
  },
  role: {
    type: String,
    enum: ['admin', 'moderator'],
    default: 'admin',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare passwords
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);
module.exports = Admin;
