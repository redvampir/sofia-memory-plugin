
(function(){
  const tokenInput = document.getElementById('github-token');
  const saveBtn = document.getElementById('save-token');
  const statusEl = document.getElementById('token-status');
  const tokenSection = document.getElementById('token-section');
  const logoutBtn = document.getElementById('logout');
  const clearLocalBtn = document.getElementById('clear-local');

  function setStatus(connected){
    if(!statusEl) return;
    statusEl.textContent = connected ? 'Connected' : 'Disconnected';
    statusEl.style.color = connected ? 'green' : 'red';
  }

  async function sendToken(token){
    await fetch('/setToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
  }

  function updateUI(){
    const has = !!localStorage.getItem('github_token');
    setStatus(has);
    if(tokenSection) tokenSection.style.display = has ? 'none' : 'block';
    if(logoutBtn) logoutBtn.style.display = has ? 'inline' : 'none';
  }

  function saveToken(){
    const token = tokenInput ? tokenInput.value.trim() : '';
    if(!token){
      setStatus(false);
      return;
    }
    localStorage.setItem('github_token', token);
    sendToken(token);
    updateUI();
  }

  function restoreToken(){
    const stored = localStorage.getItem('github_token');
    if(stored && tokenInput){
      tokenInput.value = stored;
      sendToken(stored);
    }
    updateUI();
  }

  function logout(){
    localStorage.removeItem('github_token');
    if(tokenInput) tokenInput.value = '';
    sendToken('');
    updateUI();
  }

  function clearLocal(){
    localStorage.removeItem('github_token');
    if(tokenInput) tokenInput.value = '';
    updateUI();
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
  if(logoutBtn) logoutBtn.addEventListener('click', logout);
  if(clearLocalBtn) clearLocalBtn.addEventListener('click', clearLocal);
})();
