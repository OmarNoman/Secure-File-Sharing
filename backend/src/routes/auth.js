const express = require("express");

const { signUp, login } = require("../services/authService");

const router = express.Router();

router.post("/signup", async (req, res, next) => {
  try {
    const result = await signUp(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const result = await login(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
