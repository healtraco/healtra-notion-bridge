import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body;
    const now = new Date().toISOString();

    if (!data.CaseID || !data.Status || !data.Urgency || !data.Specialty || !data.ChiefComplaint) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const response = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_DATABASE_ID,
      },
      properties: {
        CaseID: {
          title: [{ text: { content: data.CaseID } }],
        },
        Status: {
          select: { name: data.Status },
        },
        Urgency: {
          select: { name: data.Urgency },
        },
        Specialty: {
          select: { name: data.Specialty },
        },
        Age: data.Age !== null
          ? { number: data.Age }
          : undefined,
        Gender: data.Gender
          ? { select: { name: data.Gender } }
          : undefined,
        Country: data.Country
          ? { select: { name: data.Country } }
          : undefined,
        ChiefComplaint: {
          rich_text: [{ text: { content: data.ChiefComplaint } }],
        },
        Imaging: data.Imaging
          ? { rich_text: [{ text: { content: data.Imaging } }] }
          : undefined,
        Notes: data.Notes
          ? { rich_text: [{ text: { content: data.Notes } }] }
          : undefined,
        MissingInfo: data.MissingInfo?.length
          ? {
              multi_select: data.MissingInfo.map((item) => ({
                name: item,
              })),
            }
          : undefined,
        HospitalsShortlist: data.HospitalsShortlist?.length
          ? {
              multi_select: data.HospitalsShortlist.map((h) => ({
                name: h,
              })),
            }
          : undefined,
        Budget: data.Budget !== null
          ? { number: data.Budget }
          : undefined,
        CreatedAt: {
          date: { start: data.CreatedAt },
        },
        LastEdited: {
          date: { start: now },
        },
        Source: {
          select: { name: "GPT" },
        },
      },
    });

    res.status(200).json({
      success: true,
      notionPageId: response.id,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
