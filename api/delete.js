const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY });

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { pageId } = req.body;
    if (!pageId) return res.status(400).json({ error: "Missing pageId" });

    await notion.pages.update({
      page_id: pageId,
      archived: true,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error deleting session:", err);
    return res.status(500).json({ error: err.message });
  }
};
