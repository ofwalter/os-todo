import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import { storage } from "./storage.js";

const TOKEN_TTL_MS = 50 * 60 * 1000; // 50 min, Google access tokens are usually 1h
type TokenCacheEntry = { accessToken: string; expiresAt: number };
const tokenCache = new Map<number, TokenCacheEntry>();

/**
 * Thrown when the user's stored Google refresh token is no longer valid
 * (revoked, replaced, expired) and they need to log out and back in to
 * re-grant Sheets access. Routes should map this to a 401 with
 * `{code: "REAUTH_REQUIRED"}` so the client can redirect to /api/login.
 */
export class ReauthRequiredError extends Error {
  readonly code = "REAUTH_REQUIRED";
  constructor(message = "Google Sheets connection expired. Please log out and log back in to reconnect.") {
    super(message);
    this.name = "ReauthRequiredError";
  }
}

function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  // googleapis surfaces this in a few ways depending on transport.
  const fromMessage = typeof e.message === "string" && e.message.includes("invalid_grant");
  const fromResponse = e.response?.data?.error === "invalid_grant";
  return fromMessage || fromResponse;
}

/**
 * Detect "user's access token doesn't carry the spreadsheets scope".
 * Distinct from "user lacks edit access on this specific sheet" — which is
 * also a 403 but recoverable by sharing the sheet, not by re-auth.
 *
 * Google returns 403 with `status: PERMISSION_DENIED` and one of:
 *   - message: "Request had insufficient authentication scopes."
 *   - errors[].reason: "insufficientPermissions"
 *   - error.details[].reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT"
 */
function isInsufficientScopeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  if (e.code !== 403) return false;
  const msg = String(e.message ?? "").toLowerCase();
  if (msg.includes("insufficient authentication scopes")) return true;
  if (msg.includes("insufficient scope")) return true;
  const errors = e.errors ?? e.response?.data?.error?.errors ?? [];
  if (Array.isArray(errors)) {
    for (const r of errors) {
      const reason = String(r?.reason ?? "");
      if (reason === "insufficientPermissions") return true;
    }
  }
  const details = e.response?.data?.error?.details ?? [];
  if (Array.isArray(details)) {
    for (const d of details) {
      if (String(d?.reason ?? "") === "ACCESS_TOKEN_SCOPE_INSUFFICIENT") return true;
    }
  }
  return false;
}

/**
 * Centralized error handler for Sheets API call failures. Distinguishes
 * scope-insufficient (treat as REAUTH_REQUIRED — clear stale refresh token
 * so the next login will re-prompt for Sheets scope) from sheet-level
 * permission errors (the user owns/connected the wrong account or the
 * sheet isn't shared).
 */
async function handleSheetsApiError(userId: number, err: any): Promise<never> {
  if (isInsufficientScopeError(err)) {
    tokenCache.delete(userId);
    try {
      await storage.updateUser(userId, { refreshToken: null });
    } catch (clearErr) {
      console.error("Failed to clear stale refresh token after scope error:", clearErr);
    }
    throw new ReauthRequiredError(
      "Google Sheets permission was not granted. Please log in again and make sure the Google Sheets checkbox stays checked on the consent screen.",
    );
  }
  if (isInvalidCredentialsError(err)) {
    // Cached access token is no longer valid (likely revoked at Google).
    // Drop cache so the next call refreshes from the stored refresh token,
    // and bounce user through re-auth in case the refresh token is also bad.
    tokenCache.delete(userId);
    throw new ReauthRequiredError(
      "Your Google session expired. Please log in again to reconnect Sheets.",
    );
  }
  if (err?.code === 403) {
    throw new Error(
      "No edit permission on this spreadsheet. Please share edit access with the connected Google account.",
    );
  }
  throw err;
}

// Test seam — not part of the public API.
export const _isInsufficientScopeErrorForTest = isInsufficientScopeError;

/**
 * Clear the in-memory access-token cache for a user. Called from the auth
 * callback whenever a user logs in, to prevent serving an access token that
 * was issued before they revoked Google's grant. Without this, after a user
 * revokes + re-consents, the warm function instance keeps serving the
 * pre-revoke (now-invalid) access token until TTL expiry, producing
 * "Invalid Credentials" errors from the Sheets API.
 */
export function clearTokenCacheForUser(userId: number): void {
  tokenCache.delete(userId);
}

/**
 * Detect Sheets API "Invalid Credentials" / 401. Means the access token we
 * sent was rejected — typically because it was revoked at Google after we
 * cached it. Treat as REAUTH_REQUIRED: clear cache, clear refresh token (it
 * may also be revoked), bounce user to /api/login.
 */
function isInvalidCredentialsError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  if (e.code !== 401) return false;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    msg.includes("invalid credentials") ||
    msg.includes("invalid authentication credentials") ||
    msg.includes("unauthenticated")
  );
}

function requireOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

async function getAccessTokenForUser(userId: number): Promise<string> {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const user = await storage.getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  if (!user.refreshToken) {
    throw new ReauthRequiredError(
      "Google Sheets is not connected. Please log out and log back in to grant Sheets access.",
    );
  }

  const oauth2Client = requireOAuthClient();
  oauth2Client.setCredentials({ refresh_token: user.refreshToken });

  let credentials;
  try {
    ({ credentials } = await oauth2Client.refreshAccessToken());
  } catch (err) {
    if (isInvalidGrantError(err)) {
      // Token is permanently broken — clear it so we don't keep retrying with
      // a known-bad token, and ask the user to re-grant.
      tokenCache.delete(userId);
      try {
        await storage.updateUser(user.id, { refreshToken: null });
      } catch (clearErr) {
        console.error("Failed to clear stale refresh token:", clearErr);
      }
      throw new ReauthRequiredError();
    }
    throw err;
  }

  const accessToken = credentials.access_token;
  if (!accessToken) {
    throw new Error("Failed to refresh Google access token");
  }

  // If Google rotates the refresh token, persist the new one
  if (credentials.refresh_token && credentials.refresh_token !== user.refreshToken) {
    await storage.updateUser(user.id, { refreshToken: credentials.refresh_token });
  }

  const expiresAt = credentials.expiry_date
    ? credentials.expiry_date - 60_000
    : Date.now() + TOKEN_TTL_MS;
  tokenCache.set(userId, { accessToken, expiresAt });
  return accessToken;
}

// Test seams — not part of the public API.
export const _getAccessTokenForUserForTest = getAccessTokenForUser;
export function _resetTokenCacheForTest() {
  tokenCache.clear();
}

export async function getUncachableGoogleSheetClient(userId: number): Promise<sheets_v4.Sheets> {
  const accessToken = await getAccessTokenForUser(userId);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth: oauth2Client });
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const [month, day, year] = parts;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    return null;
  }
  return d;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateForSheet(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

export interface DeadlineInfo {
  name: string;
  dateStr: string;
  repetition: string;
  bucket: string;
  rowIndex: number;
}

async function getSheetMeta(userId: number, spreadsheetId: string) {
  const sheets = await getUncachableGoogleSheetClient(userId);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId",
  });
  const firstSheet = meta.data.sheets?.[0]?.properties;
  return {
    sheets,
    sheetName: firstSheet?.title || "Sheet1",
    sheetId: firstSheet?.sheetId ?? 0,
  };
}

export async function getDeadlinesForDate(
  userId: number,
  spreadsheetId: string,
  date: string,
): Promise<DeadlineInfo[]> {
  const { sheets, sheetName } = await getSheetMeta(userId, spreadsheetId);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:D`,
  });

  const rows = response.data.values;
  if (!rows || rows.length < 2) return [];

  const deadlines: DeadlineInfo[] = [];

  for (let i = 1; i < rows.length; i++) {
    const [name, dateStr, repetition, bucket] = rows[i] || [];
    if (!name || !dateStr) continue;

    const taskDate = parseDate(dateStr);
    if (!taskDate) continue;

    const taskKey = formatDateKey(taskDate);
    if (taskKey === date) {
      deadlines.push({
        name: name.trim(),
        dateStr: dateStr.trim(),
        repetition: (repetition || "").trim(),
        bucket: (bucket || "").trim(),
        rowIndex: i + 1,
      });
    }
  }

  return deadlines;
}

export function computeNewDate(currentDate: string, repetitionDays: number): string {
  const d = new Date(currentDate + "T00:00:00");

  if (repetitionDays === 30) {
    d.setMonth(d.getMonth() + 1);
  } else if (repetitionDays === 365) {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setDate(d.getDate() + repetitionDays);
  }

  return formatDateKey(d);
}

export async function updateDeadlineDateInSheet(
  userId: number,
  spreadsheetId: string,
  deadlineName: string,
  oldDateNormalized: string,
  newDateNormalized: string,
): Promise<void> {
  const { sheets, sheetName } = await getSheetMeta(userId, spreadsheetId);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:D`,
  });

  const rows = response.data.values;
  if (!rows) throw new Error("Sheet is empty");

  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    const [name, dateStr] = rows[i] || [];
    if (!name || !dateStr) continue;

    const parsed = parseDate(dateStr);
    if (!parsed) continue;

    if (name.trim() === deadlineName && formatDateKey(parsed) === oldDateNormalized) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error(`Deadline "${deadlineName}" with date ${oldDateNormalized} not found in sheet`);
  }

  const newDateSheet = formatDateForSheet(newDateNormalized);

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!B${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newDateSheet]],
      },
    });
  } catch (error: any) {
    await handleSheetsApiError(userId, error);
  }
}

export async function removeDeadlineFromSheet(
  userId: number,
  spreadsheetId: string,
  deadlineName: string,
  dateNormalized: string,
): Promise<void> {
  const { sheets, sheetName, sheetId } = await getSheetMeta(userId, spreadsheetId);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:D`,
  });

  const rows = response.data.values;
  if (!rows) throw new Error("Sheet is empty");

  let targetRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const [name, dateStr] = rows[i] || [];
    if (!name || !dateStr) continue;

    const parsed = parseDate(dateStr);
    if (!parsed) continue;

    if (name.trim() === deadlineName && formatDateKey(parsed) === dateNormalized) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex === -1) {
    throw new Error(`Deadline "${deadlineName}" with date ${dateNormalized} not found in sheet`);
  }

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: targetRowIndex,
                endIndex: targetRowIndex + 1,
              },
            },
          },
        ],
      },
    });
  } catch (error: any) {
    await handleSheetsApiError(userId, error);
  }
}

export async function pushBackBucketDeadlines(
  userId: number,
  spreadsheetId: string,
  bucket: string,
  days: number,
  excludeName?: string,
): Promise<void> {
  const { sheets, sheetName } = await getSheetMeta(userId, spreadsheetId);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A:D`,
  });

  const rows = response.data.values;
  if (!rows || rows.length < 2) return;

  const updates: { row: number; newDate: string }[] = [];
  const bucketLower = bucket.toLowerCase();

  for (let i = 1; i < rows.length; i++) {
    const [name, dateStr, , rowBucket] = rows[i] || [];
    if (!name || !dateStr) continue;
    if (excludeName && name.trim() === excludeName) continue;
    if (!rowBucket || rowBucket.trim().toLowerCase() !== bucketLower) continue;

    const parsed = parseDate(dateStr);
    if (!parsed) continue;

    const currentKey = formatDateKey(parsed);
    const newKey = computeNewDate(currentKey, days);
    updates.push({ row: i + 1, newDate: formatDateForSheet(newKey) });
  }

  if (updates.length === 0) return;

  try {
    const data = updates.map((u) => ({
      range: `'${sheetName}'!B${u.row}`,
      values: [[u.newDate]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
  } catch (error: any) {
    await handleSheetsApiError(userId, error);
  }
}

export async function addDeadlineToSheet(
  userId: number,
  spreadsheetId: string,
  deadlineName: string,
  dateNormalized: string,
  repetition: string,
  bucket: string = "",
): Promise<void> {
  const { sheets, sheetName } = await getSheetMeta(userId, spreadsheetId);

  const dateSheet = formatDateForSheet(dateNormalized);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${sheetName}'!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[deadlineName, dateSheet, repetition, bucket]],
      },
    });
  } catch (error: any) {
    await handleSheetsApiError(userId, error);
  }
}
