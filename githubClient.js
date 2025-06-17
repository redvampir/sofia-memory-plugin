
const axios = require('axios');

exports.validateToken = async function (token) {
  try {
    const res = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${token}` }
    });
    return { valid: true, user: res.data.login };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

exports.repoExists = async function (token, repo) {
  try {
    const res = await axios.get(`https://api.github.com/repos/${repo}`, {
      headers: { Authorization: `token ${token}` }
    });
    return res.status === 200;
  } catch (e) {
    return false;
  }
};
