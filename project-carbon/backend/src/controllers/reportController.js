const reportService = require("../services/reportService");

async function generateReport(req, res, next) {
  try {
    const report = await reportService.generateReport({
      ...req.body,
      userId: req.user.id,
      generatedBy: req.user.id
    });
    return res.status(201).json({
      success: true,
      data: report
    });
  } catch (error) {
    return next(error);
  }
}

async function getReport(req, res, next) {
  try {
    const report = await reportService.getReportById(req.params.id, req.user.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    return next(error);
  }
}

async function updateReportStatus(req, res, next) {
  try {
    const result = await reportService.updateReportStatus(req.params.id, req.user.id, req.body);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Report not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  generateReport,
  getReport,
  updateReportStatus
};
