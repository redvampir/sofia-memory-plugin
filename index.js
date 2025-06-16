const express = require('express');
const bodyParser = require('body-parser');
const memory = require('./memory');
const versioning = require('./versioning');

const app = express();
app.use(bodyParser.json());

app.post('/saveMemory', memory.saveMemory);
app.post('/readMemory', memory.readMemory);
app.post('/setMemoryRepo', memory.setMemoryRepo);
app.post('/saveLessonPlan', memory.saveLessonPlan);

app.post('/saveNote', memory.saveNote);
app.post('/getContextSnapshot', memory.getContextSnapshot);
app.post('/createUserProfile', memory.createUserProfile);

app.post('/version/commit', versioning.commitInstructions);
app.post('/version/rollback', versioning.rollbackInstructions);
app.post('/version/list', versioning.listVersions);

app.get('/', (req, res) => {
  res.send('Sofia plugin is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sofia Plugin Server running on port ${PORT}`);
});