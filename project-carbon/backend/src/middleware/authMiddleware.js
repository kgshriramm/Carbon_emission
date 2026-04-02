const db = require("../config/db");
const { verifyAuthToken } = require("../utils/security");

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payload = verifyAuthToken(token);
    if (!payload.userId) {
      return res.status(401).json({ success: false, message: "Invalid token payload" });
    }

    const { rows } = await db.query(
      `
      SELECT id, email, full_name, role, is_active
      FROM users
      WHERE id = $1
      `,
      [payload.userId]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: "User not active" });
    }

    req.user = {
      id: Number(user.id),
      email: user.email,
      fullName: user.full_name,
      role: user.role
    };

    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

module.exports = {
  requireAuth
};
