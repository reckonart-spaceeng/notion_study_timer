const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Exam Countdowns page contains an inline database with per-subject exam dates
const EXAM_PAGE_ID = "373dccae-e107-811c-b400-f2e60c7f47c7";
// Main Goals database holds subject pages with progress rollups
const MAIN_GOALS_DB_ID = "1f2dccae-e107-81be-a252-000bbfa8e542";

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
    // ── 1. Find the inline Exam Countdown database ──
    const blocks = await notion.blocks.children.list({
      block_id: EXAM_PAGE_ID,
      page_size: 100,
    });
    const childDb = blocks.results.find(
      (b) => b.type === "child_database"
    );
    if (!childDb) {
      return res.status(404).json({ error: "Exam countdown database not found inside page" });
    }

    // ── 2. Query exam entries ──
    const examResponse = await notion.databases.query({
      database_id: childDb.id,
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

    // ── 3. Query Main Goals for progress data ──
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

      // Extract progress from rollups / formula
      let progress = null;

      // "To Do's" rollup with percent_per_group aggregation → number 0–100
      const todosPct = props["To Do's"]?.rollup;
      if (todosPct?.type === "number" && todosPct.number != null) {
        progress = Math.round(todosPct.number);
      }

      // Fallback: Done / Total
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

      // Counts for display
      const doneTodos =
        props["Done To-Do's"]?.rollup?.type === "number"
          ? props["Done To-Do's"].rollup.number
          : null;
      const totalTodos =
        props["Total To-Do's"]?.rollup?.type === "number"
          ? props["Total To-Do's"].rollup.number
          : null;

      return {
        name: (props["Name"]?.title?.[0]?.plain_text || "").trim(),
        progress,
        doneTodos,
        totalTodos,
      };
    });

    // ── 4. Match exams ↔ goals by name (fuzzy) ──
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
        doneTodos: goal?.doneTodos ?? null,
        totalTodos: goal?.totalTodos ?? null,
      };
    });

    return res.status(200).json({ subjects });
  } catch (err) {
    console.error("Error fetching exam data:", err);
    return res.status(500).json({ error: err.message });
  }
};
