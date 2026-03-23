const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_ID = process.env.NOTION_DATABASE_ID;

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Fetch all sessions from Notion (paginated, up to 300)
    let allResults = [];
    let cursor = undefined;
    for (let i = 0; i < 3; i++) {
      const response = await notion.databases.query({
        database_id: DB_ID,
        start_cursor: cursor,
        page_size: 100,
        sorts: [{ property: "Date", direction: "descending" }],
      });
      allResults = allResults.concat(response.results);
      if (!response.has_more) break;
      cursor = response.next_cursor;
    }

    const sessions = allResults.map((page) => {
      const props = page.properties;
      return {
        id: page.id,
        subject: props["Subject"]?.select?.name || "",
        date: props["Date"]?.date?.start || "",
        startTime: props["Start Time"]?.rich_text?.[0]?.plain_text || "",
        durationMin: props["Duration (min)"]?.number || 0,
        type: props["Type"]?.select?.name || "Focus",
      };
    });

    return res.status(200).json({ sessions });
  } catch (err) {
    console.error("Error fetching sessions:", err);
    return res.status(500).json({ error: err.message });
  }
};
