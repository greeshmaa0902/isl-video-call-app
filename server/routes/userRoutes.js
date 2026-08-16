const express = require("express");

const router = express.Router();

const User = require("../models/User");

// SEARCH USERS
router.get("/search", async (req, res) => {
  try {
    const keyword = req.query.keyword;

    const users = await User.find({
      $or: [
        {
          name: {
            $regex: keyword,
            $options: "i",
          },
        },
        {
          email: {
            $regex: keyword,
            $options: "i",
          },
        },
      ],
    }).select("-password");

    res.json(users);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
});

// ADD CONTACT
router.post("/add-contact", async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    console.log("BODY:", req.body);
    console.log("USER ID:", userId);
    console.log("CONTACT ID:", contactId);

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Create contacts array if missing
    if (!user.contacts) {
      user.contacts = [];
    }

    // Prevent duplicates
    if (!user.contacts.includes(contactId)) {
      user.contacts.push(contactId);

      await user.save();
    }

    res.status(200).json({
      message: "Contact added successfully",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
});

// GET CONTACTS
router.get("/contacts/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate("contacts", "-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.status(200).json(user.contacts);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
});

module.exports = router;