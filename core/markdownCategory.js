const path = require('path');
function detectMarkdownCategory(p){
  const name = path.basename(p).toLowerCase();
  if (name.includes('instruction')) return 'instruction';
  if (name.includes('checklist')) return 'checklist';
  if (name.includes('plan')) return 'plan';
  if (name.includes('profile')) return 'profile';
  if (name.includes('lesson')) return 'lesson';
  if (name.includes('note')) return 'note';
  return 'markdown';
}
module.exports = { detectMarkdownCategory };
