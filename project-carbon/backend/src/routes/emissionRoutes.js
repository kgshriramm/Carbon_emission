const express = require("express");
const emissionController = require("../controllers/emissionController");

const router = express.Router();

router.post("/calculate", emissionController.calculateEmissions);
router.get("/:id", emissionController.getEmissionCalculation);

module.exports = router;
