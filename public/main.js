(function(){
  const tokenInput = document.getElementById('github-token');
  const saveBtn = document.getElementById('save-token');
  const statusEl = document.getElementById('token-status');

  function showStatus(text, success){
    if(!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = success ? 'green' : 'red';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  }

  function saveToken(){
    const token = tokenInput ? tokenInput.value.trim() : '';
    if(!token){
      showStatus('Token required', false);
      return;
    }
    localStorage.setItem('github_token', token);
    showStatus('Token saved', true);
  }

  function restoreToken(){
    const stored = localStorage.getItem('github_token');
    if(stored && tokenInput){
      tokenInput.value = stored;
    }
  }

  function getToken(){
    return localStorage.getItem('github_token') || '';
  }

  async function saveMemory(repo, filename, content){
    const token = getToken();
    if(!token) throw new Error('GitHub token not set');
    const res = await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, repo, filename, content })
    });
    if(!res.ok) throw new Error('Save failed');
    return res.json();
  }

  async function readMemory(repo, filename){
    const token = getToken();
    if(!token) throw new Error('GitHub token not set');
    const res = await fetch('/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, repo, filename })
    });
    if(!res.ok) throw new Error('Read failed');
    return res.json();
  }

  // expose globals
  window.saveToken = saveToken;
  window.getToken = getToken;
  window.saveMemory = saveMemory;
  window.readMemory = readMemory;

  document.addEventListener('DOMContentLoaded', restoreToken);
  if(saveBtn) saveBtn.addEventListener('click', saveToken);
})();
