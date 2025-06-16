exports.commitInstructions = (req, res) => {
  console.log('Committing instructions');
  res.json({ status: 'success', action: 'commitInstructions' });
};

exports.rollbackInstructions = (req, res) => {
  console.log('Rolling back instructions');
  res.json({ status: 'success', action: 'rollbackInstructions' });
};

exports.listVersions = (req, res) => {
  console.log('Listing instruction versions');
  res.json({ status: 'success', versions: ['v1', 'v2', 'v3'] });
};