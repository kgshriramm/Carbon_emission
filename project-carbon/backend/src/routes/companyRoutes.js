const express = require("express");
const companyController = require("../controllers/companyController");

const router = express.Router();

router.post("/companies", companyController.createCompany);
router.post("/factories", companyController.createFactory);
router.post("/products", companyController.createProduct);
router.post("/reporting-periods", companyController.createReportingPeriod);

module.exports = router;
