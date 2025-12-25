import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

export default async function handler(req, res) {
  // CORS (safe default)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const NOTION_TOKEN = process.env.NOTION_TOKEN;
    const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

    if (!NOTION_TOKEN) {
      return res.status(500).json({ success: false, error: "Missing env: NOTION_TOKEN" });
    }
    if (!NOTION_DATABASE_ID) {
      return res.status(500).json({ success: false, error: "Missing env: NOTION_DATABASE_ID" });
    }

    // Parse body safely
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const {
      caseId,
      status,
      anonymizedSummary,
      specialty,
      urgency,
      countryPreference
    } = body || {};

    if (!caseId) {
      return res.status(400).json({ success: false, error: "caseId is required" });
    }

    // IMPORTANT:
    // These property names MUST match your Notion database column names EXACTLY:
    // "Case ID" (Title) and "Status" (Status)
    const properties = {
      "Case ID": {
        title: [{ text: { content: String(caseId) } }]
      }
    };

    if (status) {
      properties["Status"] = { status: { name: String(status) } };
    }

    // Optional fields (only if you have these columns in Notion)
    if (anonymizedSummary) {
      properties["Anonymized Summary"] = {
        rich_text: [{ text: { content: String(anonymizedSummary) } }]
      };
    }
    if (specialty) {
      properties["Specialty"] = { select: { name: String(specialty) } };
    }
    if (urgency) {
      properties["Urgency"] = { select: { name: String(urgency) } };
    }
    if (countryPreference) {
      properties["Country Preference"] = {
        rich_text: [{ text: { content: String(countryPreference) } }]
      };
    }

    const created = await notion.pages.create({
      parent: { database_id: NOTION_DATABASE_ID },
      properties
    });

    return res.status(200).json({
      success: true,
      id: created.id,
      notionUrl: created.url
    });
  } catch (err) {
    // Return real error details to help debugging
    const message = err?.message || String(err);
    const code = err?.code || null;
    const status = err?.status || null;
    const body = err?.body || null;

    return res.status(500).json({
      success: false,
      error: "Notion write failed",
      message,
      code,
      status,
      body
    });
  }
}
