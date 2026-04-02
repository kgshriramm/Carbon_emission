const carbonService = require("../services/carbonService");

async function createActivityData(req, res, next) {
  try {
    const activity = await carbonService.createActivityData({
      ...req.body,
      userId: req.user.id
    });
    return res.status(201).json({
      success: true,
      data: activity
    });
  } catch (error) {
    return next(error);
  }
}

async function calculateEmissions(req, res, next) {
  try {
    const result = await carbonService.calculateAndStoreEmissions({
      ...req.body,
      userId: req.user.id
    });
    return res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

async function getEmissionCalculation(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid calculation id"
      });
    }

    const calculation = await carbonService.getCalculationById(id, req.user.id);
    if (!calculation) {
      return res.status(404).json({
        success: false,
        message: "Emission calculation not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: calculation
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createActivityData,
  calculateEmissions,
  getEmissionCalculation
};
