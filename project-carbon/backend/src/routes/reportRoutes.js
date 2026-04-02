const express = require("express");
const reportController = require("../controllers/reportController");

const router = express.Router();

router.post("/generate", reportController.generateReport);
router.get("/:id", reportController.getReport);
router.patch("/:id/status", reportController.updateReportStatus);

module.exports = router;
