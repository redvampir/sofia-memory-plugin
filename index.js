
const express = require("express");
const fs = require("fs");
const path = require("path");
const { saveMemoryToGitHub, readMemoryFromGitHub } = require("./utils/github");
const { generateTemplate } = require("./utils/note-template");

const app = express();
app.use(express.json());
app.use(express.static("public"));

app.post("/save", async (req, res) => {
  const { repo, token, filename, content } = req.body;
  if (!repo || !token || !filename || !content) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    await saveMemoryToGitHub(repo, token, filename, content);
    res.status(200).json({ message: "Memory saved to GitHub." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/read", async (req, res) => {
  const { repo, token, filename } = req.body;
  try {
    const content = await readMemoryFromGitHub(repo, token, filename);
    res.status(200).json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/template", (req, res) => {
  const { title, type } = req.query;
  const template = generateTemplate(title || "Заметка", type || "lesson");
  res.type("text/markdown").send(template);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Sofia memory plugin running on port", PORT));
