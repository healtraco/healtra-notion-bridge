import { Client } from "@notionhq/client";

// Initialize Notion client (token must be set in Vercel env vars)
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Small helper to return JSON consistently
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

// Helper: safely convert any value to string
function toStr(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}

// Helper: Notion database IDs should be UUID-like (32 hex, with or without dashes)
function normalizeNotionDbId(input) {
  const raw = toStr(input).trim();

  // If someone accidentally stored a Notion URL, try to extract the last 32-hex segment
  // e.g. https://www.notion.so/2d31c70fce6f80969f7ad4bd1ecd16a4
  const urlMatch = raw.match(/[0-9a-fA-F]{32}/);
  const candidate = urlMatch ? urlMatch[0] : raw.replace(/-/g, "");

  // Validate 32-hex
  if (!/^[0-9a-fA-F]{32}$/.test(candidate)) return null;

  // Return dashed UUID format: 8-4-4-4-12
  return (
    candidate.slice(0, 8) +
    "-" +
    candidate.slice(8, 12) +
    "-" +
    candidate.slice(12, 16) +
    "-" +
    candidate.slice(16, 20) +
    "-" +
    candidate.slice(20)
  ).toLowerCase();
}

// Build Notion properties safely.
// IMPORTANT: The property names here MUST match your Notion database property names.
function buildProperties(body) {
  const caseId = toStr(body.caseId).trim();
  const status = toStr(body.status || "New").trim();
  const specialty = toStr(body.specialty).trim();
  const urgency = toStr(body.urgency).trim();
  const country = toStr(body.country).trim();
  const chiefComplaint = toStr(body.chiefComplaint).trim();
  const imaging = toStr(body.imaging).trim();
  const notes = toStr(body.notes).trim();

  // Required field check
  if (!caseId) {
    return { error: "caseId is required" };
  }

  // These fields are optional, but you can enforce if you want.
  // Example:
  // if (!specialty) return { error: "specialty is required" };

  // ----
  // ⚠️ IMPORTANT:
  // The property keys below (CaseID, Status, Specialty...) must match your Notion DB column names EXACTLY.
  // If your database uses different names, change them here.
  // ----
  const props = {
    CaseID: {
      title: [{ text: { content: caseId } }],
    },
    Status: {
      select: { name: status || "New" },
    },
  };

  // Add selects only if provided (prevents Notion errors if empty)
  if (specialty) props.Specialty = { select: { name: specialty } };
  if (urgency) props.Urgency = { select: { name: urgency } };
  if (country) props.Country = { select: { name: country } };

  // Rich text fields
  if (chiefComplaint) {
    props.ChiefComplaint = { rich_text: [{ text: { content: chiefComplaint } }] };
  }
  if (imaging) {
    props.Imaging = { rich_text: [{ text: { content: imaging } }] };
  }
  if (notes) {
    props.Notes = { rich_text: [{ text: { content: notes } }] };
  }

  return { props };
}

export default async function handler(req, res) {
  // Basic CORS (adjust origin as needed)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return json(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    // Validate env vars
    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const rawDbId = process.env.NOTION_DATABASE_ID;

    if (!NOTION_TOKEN) {
      return json(res, 500, { success: false, error: "Missing env: NOTION_TOKEN" });
    }
    if (!rawDbId) {
      return json(res, 500, { success: false, error: "Missing env: NOTION_DATABASE_ID" });
    }

    const database_id = normalizeNotionDbId(rawDbId);
    if (!database_id) {
      return json(res, 500, {
        success: false,
        error: "Invalid env: NOTION_DATABASE_ID",
        message:
          "NOTION_DATABASE_ID must be the database UUID (32 hex) not a URL. Example: 2d31c70fce6f80969f7ad4bd1ecd16a4",
        valueSeen: rawDbId,
      });
    }

    // Parse JSON body (Vercel usually parses already, but keep safe)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return json(res, 400, { success: false, error: "Invalid JSON body" });
      }
    }
    if (!body || typeof body !== "object") {
      return json(res, 400, { success: false, error: "Request body must be JSON" });
    }

    // Build properties from body
    const built = buildProperties(body);
    if (built.error) {
      return json(res, 400, { success: false, error: built.error });
    }

    // Create page in Notion DB
    const created = await notion.pages.create({
      parent: { database_id }, // ✅ ALWAYS UUID FROM ENV
      properties: built.props,
    });

    return json(res, 200, {
      success: true,
      notionPageId: created.id,
    });
  } catch (err) {
    // Try to surface Notion API error details
    const status = err?.status || 500;
    const code = err?.code || "unknown_error";
    const message = err?.message || "Unknown error";

    return json(res, 500, {
      success: false,
      error: "Notion write failed",
      message,
      code,
      status,
      body: err?.body ? toStr(err.body) : undefined,
    });
  }
}
