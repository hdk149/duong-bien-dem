require("dotenv").config();

const express = require("express");

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3001;
const AI_KEY = process.env.LOCAL_AI_KEY;

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "duong-bien-dem-local-ai",
  });
});

app.post("/v1/chat/completions", async (req, res) => {
  console.log("🔥🔥🔥 GAME ĐÃ GỌI LOCAL AI 🔥🔥🔥");
  console.log("MODEL:", req.body?.model);

  try {
    // phần code cũ giữ nguyên
    const auth = req.headers.authorization;

    if (!AI_KEY || auth !== `Bearer ${AI_KEY}`) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const response = await fetch(
      "http://127.0.0.1:1234/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(60000),
      }
    );

    const text = await response.text();

    res.status(response.status);

    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.send(text);
    }
  } catch (error) {
    console.error("Local AI error:", error);

    return res.status(502).json({
      error: "Local AI unavailable",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Local AI Gateway running on http://127.0.0.1:${PORT}`
  );
});