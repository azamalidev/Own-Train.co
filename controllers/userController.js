const { validationResult } = require("express-validator");

const TextChunkSchema = require("../models/TextChunkSchema");
const { User } = require("../models/User");

const userController = {
  // Create new user (no password)
  // createUser: async (req, res) => {
  //   try {
  //     const errors = validationResult(req);
  //     if (!errors.isEmpty()) {
  //       return res.status(400).json({ errors: errors.array() });
  //     }

  //     const { name, email, telephone, role } = req.body;

  //     // Check if user exists
  //     const existingUser = await User.findOne({ email });
  //     if (existingUser) {
  //       // alert("User already exists!");
  //       return res.status(400).json({ message: "User already exists" });
  //     }

  //     // Create and save user
  //     const user = new User({
  //       name,
  //       email,
  //       telephone,
  //       role: role || "user",
  //     });

  //     await user.save();

  //     res.status(201).json(user);
  //   } catch (err) {
  //     console.error(err.message);
  //     res.status(500).send("Server error");
  //   }

  //   // alert("Failed login");
  // },

  // Get all users
  getAllUsers: async (req, res) => {
    try {
      const users = await User.find();
      res.json(users);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  },

  // Get single user
  getUser: async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  },

  // Update user
  updateUser: async (req, res) => {
    try {
      const { name, email, role } = req.body;

      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        { name, email, role },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  },

  // Delete user
  deleteUser: async (req, res) => {
    try {
      const deletedUser = await User.findByIdAndDelete(req.params.id);
      if (!deletedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User deleted successfully" });
    } catch (err) {
      console.error(err.message);
      res.status(500).send("Server error");
    }
  },

  deleteChunks: async (req, res) => {
    await TextChunkSchema.deleteMany({});
    res.status(200).json({
      message: "Chunks deleted",
    });
  },
};

module.exports = userController;
