const jwt = require("jsonwebtoken");

const { getJwtSecret } = require("../config/auth");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: { message: "Missing or invalid Authorization header" } });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    req.user = { username: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: { message: "Invalid or expired token" } });
  }
}

module.exports = requireAuth;
