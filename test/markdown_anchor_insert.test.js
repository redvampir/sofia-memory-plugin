const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mdEditor = require('../markdownEditor');

const tmpDir = path.join(__dirname, 'tmp_anchor');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

function read(p){return fs.readFileSync(p,'utf-8');}

(async function run(){
  // 1. Insert a checklist after a heading
  const f1 = path.join(tmpDir,'tasks.md');
  fs.writeFileSync(f1, '# Title\n\n## Tasks\n');
  mdEditor.insertAtAnchor({ filePath:f1, heading:'Tasks', level:2, content:'- [ ] item' });
  assert.ok(read(f1).includes('- [ ] item'));

  // 2. Inject block between tags
  const f2 = path.join(tmpDir,'tags.md');
  fs.writeFileSync(f2, 'Start\n<!--start-->\n<!--end-->\nEnd');
  mdEditor.insertAtAnchor({ filePath:f2, tag:'<!--start-->', content:'Block', position:'after' });
  mdEditor.insertAtAnchor({ filePath:f2, tag:'<!--end-->', content:'BlockEnd', position:'before' });
  const cont2 = read(f2);
  assert.ok(/<!--start-->\n\nBlock/.test(cont2));
  assert.ok(/BlockEnd\n\n<!--end-->/.test(cont2));

  // 3. After third subsection
  const f3 = path.join(tmpDir,'sub.md');
  fs.writeFileSync(f3, '# T\n\n### Subsection\none\n### Subsection\ntwo\n### Subsection\nthree');
  mdEditor.insertAtAnchor({ filePath:f3, heading:'Subsection', level:3, occurrence:3, content:'new paragraph' });
  const cont3 = read(f3);
  assert.ok(/### Subsection\n\nnew paragraph\n\nthree/.test(cont3));

  // 4. Skip if exists
  const f4 = path.join(tmpDir,'dup.md');
  fs.writeFileSync(f4, '# T\n\n## Tasks\n- existing');
  mdEditor.insertAtAnchor({ filePath:f4, heading:'Tasks', level:2, content:'- existing', skipIfExists:true });
  const cont4 = read(f4);
  assert.strictEqual(cont4.match(/- existing/g).length, 1);

  // 5. Insert table inside tag
  const f5 = path.join(tmpDir,'table.md');
  fs.writeFileSync(f5, 'Start\n<!-- table:stats -->\nEnd');
  mdEditor.insertAtAnchor({ filePath:f5, tag:'<!-- table:stats -->', content:['| A | B |','| - | - |','| 1 | 2 |'] });
  const cont5 = read(f5);
  assert.ok(cont5.includes('| A | B |'));

  console.log('markdown anchor insert tests passed');
})();
