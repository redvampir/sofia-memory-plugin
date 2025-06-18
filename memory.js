// memory.js
const { Octokit } = require("@octokit/rest");

exports.saveMemory = async (req, res) => {
  const { token, repo, filename, content } = req.body;

  if (!token || !repo || !filename || !content) {
    console.warn("[SaveMemory] Missing fields:", { repo, filename });
    return res.status(400).json({ error: "Missing required fields" });
  }

  const octokit = new Octokit({ auth: token });
  const [owner, repository] = repo.split("/");

  console.log("[SaveMemory] Saving to", { owner, repository, filename });

  try {
    const response = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: repository,
      path: filename,
      message: "Save memory file",
      content: Buffer.from(content).toString("base64"),
      committer: {
        name: "Sofia Memory Plugin",
        email: "sofia@example.com",
      },
      author: {
        name: "Sofia Memory Plugin",
        email: "sofia@example.com",
      },
    });

    console.log("[SaveMemory] Success", {
      status: response.status,
      sha: response.data.content.sha,
    });

    res.status(200).json({
      success: true,
      status: response.status,
      sha: response.data.content.sha,
    });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message = error?.response?.data?.message || error.message;

    console.error("[SaveMemory] GitHub error", {
      status,
      message,
      details: error?.response?.data,
    });

    res.status(status).json({
      success: false,
      error: message,
      details: error?.response?.data,
    });
  }
};

exports.readMemory = async (req, res) => {
  const { token, repo, filename } = req.body;

  if (!token || !repo || !filename) {
    console.warn("[ReadMemory] Missing fields:", { repo, filename });
    return res.status(400).json({ error: "Missing required fields" });
  }

  const octokit = new Octokit({ auth: token });
  const [owner, repository] = repo.split("/");

  console.log("[ReadMemory] Reading from", { owner, repository, filename });

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo: repository,
      path: filename,
    });

    const content = Buffer.from(response.data.content, "base64").toString("utf-8");

    console.log("[ReadMemory] File read successfully");

    res.status(200).json({ content });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message = error?.response?.data?.message || error.message;

    console.error("[ReadMemory] GitHub error", {
      status,
      message,
      details: error?.response?.data,
    });

    res.status(status).json({
      error: message,
      details: error?.response?.data,
    });
  }
};
