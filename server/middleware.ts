import { type Request, type Response, type NextFunction } from "express";
import { verifyToken, type AuthPayload } from "./auth";

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão expirada. Por favor, faça login novamente." });
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Sessão inválida. Por favor, faça login novamente." });
  }
}

export function roleMiddleware(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Sessão expirada. Por favor, faça login novamente." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Você não tem permissão para acessar este recurso." });
    }

    next();
  };
}

// Middleware to scope agenda queries for assistentes
export function agendaScopeMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: "Sessão expirada. Por favor, faça login novamente." });
  }

  // Assistentes can only see their own activities
  if (req.user.role === "assistente") {
    req.query.userId = req.user.userId;
  }

  next();
}

// Middleware to scope reports queries for assistentes
export function reportsScopeMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ error: "Sessão expirada. Por favor, faça login novamente." });
  }

  // Assistentes can only see their own reports
  if (req.user.role === "assistente") {
    req.query.userId = req.user.userId;
  }

  next();
}
