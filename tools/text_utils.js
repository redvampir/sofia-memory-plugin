function estimate_cost(text = '', mode = 'tokens') {
  if (mode === 'tokens') {
    return Math.ceil(text.length / 4); // примерная оценка токенов
  }
  if (mode === 'bytes') {
    return Buffer.byteLength(text, 'utf-8');
  }
  if (mode === 'lines') {
    return text.split(/\r?\n/).length;
  }
  return text.length; // fallback: символы
}

module.exports = { estimate_cost };
