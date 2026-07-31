import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { ClipFlowDatabase, type UserAccount } from './database.js';

const cookieName = 'clipflow_session';
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

export class EmailAlreadyExistsError extends Error {}
export class InvalidCredentialsError extends Error {}

export function registerUser(database: ClipFlowDatabase, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (database.getUserCredentialsByEmail(normalizedEmail)) throw new EmailAlreadyExistsError();
  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  return database.createUser(randomUUID(), normalizedEmail, hash, salt);
}

export function authenticateUser(database: ClipFlowDatabase, email: string, password: string) {
  const credentials = database.getUserCredentialsByEmail(email.trim().toLowerCase());
  if (!credentials) throw new InvalidCredentialsError();
  const actual = Buffer.from(hashPassword(password, credentials.passwordSalt), 'hex');
  const expected = Buffer.from(credentials.passwordHash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new InvalidCredentialsError();
  }
  const { passwordHash: _hash, passwordSalt: _salt, ...user } = credentials;
  void _hash;
  void _salt;
  return user;
}

export function startSession(database: ClipFlowDatabase, response: Response, userId: string): void {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString();
  database.createSession(hashToken(token), userId, expiresAt);
  response.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionLifetimeSeconds * 1000,
    path: '/',
  });
}

export function endSession(database: ClipFlowDatabase, request: Request, response: Response): void {
  const token = readCookie(request, cookieName);
  if (token) database.deleteSession(hashToken(token));
  response.clearCookie(cookieName, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export function currentUser(database: ClipFlowDatabase, request: Request): UserAccount | undefined {
  const token = readCookie(request, cookieName);
  return token ? database.getUserBySession(hashToken(token)) : undefined;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
