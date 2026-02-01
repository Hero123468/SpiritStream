import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.static("public"));

const API_KEY = "ZqWz4AkUdqS7yQj5H5wCr";   // <-- put your key here
const BASE = "https://api.scripture.api.bible/v1"; // <- FIXED!


app.get("/chapter", async (req, res) => {
  res.set("Cache-Control", "no-store");  
  const { bibleId, chapterId } = req.query;

  const url = `${BASE}/bibles/${bibleId}/chapters/${chapterId}?content-type=text&include-verse-numbers=true`;

  try {
    const apiRes = await fetch(url, {
      headers: { "api-key": API_KEY }
    });

    const data = await apiRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Proxy error" });
  }
});

app.listen(3000, () => {
  console.log("Spirit Stream backend running at http://localhost:3000");
});
