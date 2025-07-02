const axios = require('axios');

async function requestToAgent(endpoint, method = 'GET', data = {}) {
  const baseUrl = 'http://localhost:4465';
  try {
    const response = await axios({
      method,
      url: `${baseUrl}${endpoint}`,
      data,
      params: method.toUpperCase() === 'GET' ? data : undefined,
    });
    return response.data;
  } catch (error) {
    console.error('\u274c \u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0437\u0430\u043f\u0440\u043e\u0441\u0435 \u043a \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u043c\u0443 \u0430\u0433\u0435\u043d\u0442\u0443:', error.message);
    throw error;
  }
}

module.exports = { requestToAgent };
