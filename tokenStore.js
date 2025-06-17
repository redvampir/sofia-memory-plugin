let storedToken = process.env.GITHUB_TOKEN || null;

exports.setToken = (token) => {
  storedToken = token;
};

exports.getToken = () => storedToken;
