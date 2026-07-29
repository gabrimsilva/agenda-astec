import rateLimit from "express-rate-limit";

// Security: Rate limiting for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  // Use email + IP for better limiting
  keyGenerator: (req) => {
    const email = req.body?.email || req.body?.username || '';
    return `${req.ip}-${email}`;
  }
});

// Security: General API rate limiting
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: 'Muitas requisições. Tente novamente em alguns instantes.',
  standardHeaders: true,
  legacyHeaders: false
});
