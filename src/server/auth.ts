import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { dataStore, UserRecord } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "prepkit-default-jwt-secret";
const TOKEN_EXPIRY = "7d";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export async function hashPassword(plainText: string): Promise<string> {
  return await bcrypt.hash(plainText, 10);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plainText, hash);
}

export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export async function registerUser(
  email: string,
  passwordPlain: string
): Promise<{ user: AuthenticatedUser; token: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !passwordPlain) {
    throw new Error("Email and password are required.");
  }
  if (passwordPlain.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const existing = await dataStore.findUserByEmail(cleanEmail);
  if (existing) {
    throw new Error("An account with this email already exists.");
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(passwordPlain, salt);

  const newUser: UserRecord = {
    id: `usr_${crypto.randomUUID()}`,
    email: cleanEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  await dataStore.createUser(newUser);

  const authUser: AuthenticatedUser = { id: newUser.id, email: newUser.email };
  const token = generateToken(authUser);

  return { user: authUser, token };
}

export async function loginUser(
  email: string,
  passwordPlain: string
): Promise<{ user: AuthenticatedUser; token: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const user = await dataStore.findUserByEmail(cleanEmail);
  if (!user) {
    throw new Error("Invalid email or password.");
  }

  const matches = bcrypt.compareSync(passwordPlain, user.passwordHash);
  if (!matches) {
    throw new Error("Invalid email or password.");
  }

  const authUser: AuthenticatedUser = { id: user.id, email: user.email };
  const token = generateToken(authUser);

  return { user: authUser, token };
}

/**
 * Express Middleware protecting authenticated routes.
 * Checks HTTP-Only cookie 'token' or 'Authorization: Bearer <token>' header.
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  let token = req.cookies?.token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
  }

  if (!token) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication required. Please log in to access this resource.",
    });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({
      error: "SESSION_EXPIRED",
      message: "Your session has expired or is invalid. Please log in again.",
    });
  }
}
