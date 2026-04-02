const express = require("express");
const authController = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/magic-link/request", authController.requestMagicLink);
router.post("/magic-link/verify", authController.verifyMagicLink);
router.post("/demo", authController.demoLogin);
router.get("/me", requireAuth, authController.me);

module.exports = router;
