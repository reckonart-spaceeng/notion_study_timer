const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// "Exam Dates" database inside the Exam Countdowns page
const EXAM_DB_ID = "62d83478-7622-43b6-9a46-0d0b7731f1e2";
// Main Goals database holds subject pages with progress rollups
const MAIN_GOALS_DB_ID = "1f2dccae-e107-81eb-9ca2-dcd8531ffb47";

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
    // ── 1. Query exam entries ──
    const examResponse = await notion.databases.query({
      database_id: EXAM_DB_ID,
      page_size: 100,
    });
    const exams = examResponse.results
      .map((page) => {
        const props = page.properties;
        return {
          name: props["Exam"]?.title?.[0]?.plain_text || "",
          code: (props["Code"]?.rich_text?.[0]?.plain_text || "").trim(),
          date: props["Date"]?.date?.start || null,
          difficulty: props["Difficulty"]?.select?.name || "",
          target: props["Target"]?.select?.name || "",
        };
      })
      .filter((e) => e.code && e.date);

    // ── 2. Query Main Goals for progress data ──
    const goalResponse = await notion.databases.query({
      database_id: MAIN_GOALS_DB_ID,
      filter: {
        property: "Status",
        status: { equals: "In progress" },
      },
      page_size: 100,
    });

    const goals = goalResponse.results.map((page) => {
      const props = page.properties;

      // Extract progress — try Progress Bar formula first
      let progress = null;

      // 1. "Progress Bar" formula → may return number or string
      const pbar = props["Progress Bar"]?.formula;
      if (pbar) {
        if (pbar.type === "number" && pbar.number != null) {
          progress = Math.round(pbar.number * (pbar.number <= 1 ? 100 : 1));
        } else if (pbar.type === "string" && pbar.string) {
          // Parse percentage from strings like "██████░░░░ 47%" or "47%"
          const m = pbar.string.match(/(\d+(?:\.\d+)?)\s*%/);
          if (m) progress = Math.round(parseFloat(m[1]));
        }
      }

      // 2. Fallback: "To Do's" rollup (percent_per_group)
      if (progress === null) {
        const todosPct = props["To Do's"]?.rollup;
        if (todosPct?.type === "number" && todosPct.number != null) {
          progress = Math.round(todosPct.number);
        }
      }

      // 3. Fallback: Done / Total rollups
      if (progress === null) {
        const done = props["Done To-Do's"]?.rollup;
        const total = props["Total To-Do's"]?.rollup;
        if (
          done?.type === "number" &&
          total?.type === "number" &&
          total.number > 0
        ) {
          progress = Math.round((done.number / total.number) * 100);
        }
      }

      return {
        name: (props["Name"]?.title?.[0]?.plain_text || "").trim(),
        progress,
        // Include raw formula value for debugging
        progressBarRaw: pbar || null,
      };
    });

    // ── 3. Match exams ↔ goals by name (fuzzy) ──
    const subjects = exams.map((exam) => {
      // Try exact match first, then substring containment
      const examLower = exam.name.toLowerCase();
      const goal =
        goals.find((g) => g.name.toLowerCase() === examLower) ||
        goals.find(
          (g) =>
            g.name.toLowerCase().includes(examLower) ||
            examLower.includes(g.name.toLowerCase())
        );

      return {
        code: exam.code,
        name: exam.name,
        examDate: exam.date,
        difficulty: exam.difficulty,
        target: exam.target,
        progress: goal?.progress ?? null,
        progressBarRaw: goal?.progressBarRaw ?? null,
      };
    });

    return res.status(200).json({ subjects });
  } catch (err) {
    console.error("Error fetching exam data:", err);
    return res.status(500).json({ error: err.message });
  }
};
