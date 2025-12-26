import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

function normalizeNotionDbId(input) {
  const raw = (input || "").toString().trim();
  const urlMatch = raw.match(/[0-9a-fA-F]{32}/);
  const candidate = (urlMatch ? urlMatch[0] : raw).replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(candidate)) return null;

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

function safeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeArray(v) {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.map((x) => safeStr(x)).filter(Boolean);
  // Allow comma-separated string
  return safeStr(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // Env checks
    if (!process.env.NOTION_TOKEN) {
      return res.status(500).json({ success: false, error: "Missing env: NOTION_TOKEN" });
    }
    if (!process.env.NOTION_DATABASE_ID) {
      return res.status(500).json({ success: false, error: "Missing env: NOTION_DATABASE_ID" });
    }

    const database_id = normalizeNotionDbId(process.env.NOTION_DATABASE_ID);
    if (!database_id) {
      return res.status(500).json({
        success: false,
        error: "Invalid env: NOTION_DATABASE_ID",
        message: "Use the Notion database UUID (32 hex), not a URL.",
        valueSeen: process.env.NOTION_DATABASE_ID,
      });
    }

    // Parse body (string or object)
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    // Accept BOTH camelCase and NotionCase
    const data = {
      CaseID: body.CaseID ?? body.caseId,
      Status: body.Status ?? body.status,
      Urgency: body.Urgency ?? body.urgency,
      Specialty: body.Specialty ?? body.specialty,
      Age: body.Age ?? body.age,
      Gender: body.Gender ?? body.gender,
      Country: body.Country ?? body.country,
      ChiefComplaint: body.ChiefComplaint ?? body.chiefComplaint,
      Imaging: body.Imaging ?? body.imaging,
      Notes: body.Notes ?? body.notes,
      AssignedTo: body.AssignedTo ?? body.assignedTo, // People (optional; usually set manually)
      HospitalsShortlist: body.HospitalsShortlist ?? body.hospitalsShortlist,
      Budget: body.Budget ?? body.budget,
      Source: body.Source ?? body.source ?? "GPT",
    };

    // Required fields (minimum viable record)
    const CaseID = safeStr(data.CaseID).trim();
    const Status = safeStr(data.Status).trim();
    const Urgency = safeStr(data.Urgency).trim();
    const Specialty = safeStr(data.Specialty).trim();

    if (!CaseID || !Status || !Urgency || !Specialty) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["caseId/CaseID", "status/Status", "urgency/Urgency", "specialty/Specialty"],
        receivedKeys: Object.keys(body || {}),
      });
    }

    const nowIso = new Date().toISOString();

    // Build Notion properties (ONLY include when value is present)
    const properties = {
      CaseID: {
        title: [{ text: { content: CaseID } }],
      },
      Status: { select: { name: Status } },
      Urgency: { select: { name: Urgency } },
      Specialty: { select: { name: Specialty } },

      // Optional fields
      Age: toNumberOrNull(data.Age) !== null ? { number: toNumberOrNull(data.Age) } : undefined,
      Gender: safeStr(data.Gender).trim() ? { select: { name: safeStr(data.Gender).trim() } } : undefined,
      Country: safeStr(data.Country).trim() ? { select: { name: safeStr(data.Country).trim() } } : undefined,

      ChiefComplaint: safeStr(data.ChiefComplaint).trim()
        ? { rich_text: [{ text: { content: safeStr(data.ChiefComplaint).trim() } }] }
        : undefined,

      Imaging: safeStr(data.Imaging).trim()
        ? { rich_text: [{ text: { content: safeStr(data.Imaging).trim() } }] }
        : undefined,

      Notes: safeStr(data.Notes).trim()
        ? { rich_text: [{ text: { content: safeStr(data.Notes).trim() } }] }
        : undefined,

      HospitalsShortlist: normalizeArray(data.HospitalsShortlist).length
        ? { multi_select: normalizeArray(data.HospitalsShortlist).map((n) => ({ name: n })) }
        : undefined,

      Budget: toNumberOrNull(data.Budget) !== null ? { number: toNumberOrNull(data.Budget) } : undefined,

      CreatedAt: { date: { start: body.CreatedAt ?? nowIso } },
      LastEdited: { date: { start: nowIso } },
      Source: { select: { name: safeStr(data.Source).trim() || "GPT" } },
    };

    // NOTE: AssignedTo is a People property; Notion API expects user IDs, not names.
    // So we intentionally DO NOT set AssignedTo from text input.
    // Keep it for manual assignment in Notion.
    delete properties.AssignedTo;

    // Remove undefined properties (important for Notion API)
    for (const k of Object.keys(properties)) {
      if (properties[k] === undefined) delete properties[k];
    }

    const created = await notion.pages.create({
      parent: { database_id },
      properties,
    });

    return res.status(200).json({
      success: true,
      notionPageId: created.id,
      CaseID,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Notion write failed",
      message: err?.message || String(err),
      code: err?.code,
      status: err?.status,
      body: err?.body ? String(err.body) : undefined,
    });
  }
}
