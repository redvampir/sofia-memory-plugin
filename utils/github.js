
const { Octokit } = require("@octokit/rest");

async function saveMemoryToGitHub(repoFullName, token, filename, content) {
  const octokit = new Octokit({ auth: token });
  const [owner, repo] = repoFullName.split("/");
  const path = `Sofia's memory/${filename}`;

  try {
    const { data: existingFile } = await octokit.repos.getContent({ owner, repo, path });
    const sha = existingFile.sha;
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `Update memory: ${filename}`,
      content: Buffer.from(content).toString("base64"),
      sha
    });
  } catch (error) {
    if (error.status === 404) {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `Add memory: ${filename}`,
        content: Buffer.from(content).toString("base64")
      });
    } else {
      throw error;
    }
  }
}

async function readMemoryFromGitHub(repoFullName, token, filename) {
  const octokit = new Octokit({ auth: token });
  const [owner, repo] = repoFullName.split("/");
  const path = `Sofia's memory/${filename}`;

  const { data } = await octokit.repos.getContent({ owner, repo, path });
  const buffer = Buffer.from(data.content, "base64");
  return buffer.toString("utf-8");
}

module.exports = { saveMemoryToGitHub, readMemoryFromGitHub };


async function createFile(octokit, owner, repo, path, content) {
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: 'heads/main'
  });

  const blob = await octokit.git.createBlob({
    owner,
    repo,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64'
  });

  const newTree = await octokit.git.createTree({
    owner,
    repo,
    base_tree: refData.object.sha,
    tree: [{
      path: path,
      mode: '100644',
      type: 'blob',
      sha: blob.data.sha
    }]
  });

  const commit = await octokit.git.createCommit({
    owner,
    repo,
    message: `Create ${path}`,
    tree: newTree.data.sha,
    parents: [refData.object.sha]
  });

  await octokit.git.updateRef({
    owner,
    repo,
    ref: 'heads/main',
    sha: commit.data.sha
  });
}

async function createProfileFile(octokit, owner, repo, username, language) {
  const content = `# User Profile\n**Username**: ${username}\n**Language**: ${language}`;
  await createFile(octokit, owner, repo, "memory/profile.md", content);
}

async function createProjectOverviewFile(octokit, owner, repo, projectName, description) {
  const content = `# Project: ${projectName}\n\n## Description\n${description}`;
  await createFile(octokit, owner, repo, "memory/project-overview.md", content);
}

async function createLessonPlanFile(octokit, owner, repo, title, theory, practice) {
  const content = `# Lesson Plan\n\n## Theory\n${theory}\n\n## Practice\n${practice}`;
  await createFile(octokit, owner, repo, `memory/lessons/${title}.md`, content);
}

async function refreshContextFromMemoryFiles(octokit, owner, repo) {
  const { data: files } = await octokit.repos.getContent({
    owner,
    repo,
    path: 'memory'
  });

  const summaries = [];
  for (const file of files) {
    if (file.type === 'file' && file.name.endsWith('.md')) {
      const { data: contentData } = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path
      });
      const content = Buffer.from(contentData.content, 'base64').toString();
      summaries.push(`## ${file.name}\n` + content.split('\n').slice(0, 5).join('\n'));
    }
  }

  return summaries.join('\n\n');
}

module.exports = {
  createProfileFile,
  createProjectOverviewFile,
  createLessonPlanFile,
  refreshContextFromMemoryFiles
};
