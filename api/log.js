const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_ID = process.env.NOTION_DATABASE_ID;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { subject, date, startTime, durationMin, type } = req.body;

    if (!subject || !date || !durationMin) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const page = await notion.pages.create({
      parent: { database_id: DB_ID },
      properties: {
        Session: {
          title: [{ text: { content: `${subject} — ${durationMin}min` } }],
        },
        Subject: {
          select: { name: subject },
        },
        Date: {
          date: { start: date },
        },
        "Start Time": {
          rich_text: [{ text: { content: startTime || "" } }],
        },
        "Duration (min)": {
          number: durationMin,
        },
        Type: {
          select: { name: type || "Focus" },
        },
      },
    });

    return res.status(200).json({ success: true, id: page.id });
  } catch (err) {
    console.error("Error logging session:", err);
    return res.status(500).json({ error: err.message });
  }
};
