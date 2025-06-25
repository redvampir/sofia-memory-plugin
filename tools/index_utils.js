const fs = require('fs');
const path = require('path');

function index_to_array(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const result = [];
  if (data.profile) {
    const entry = { type: 'profile', ...data.profile };
    result.push(entry);
  }
  if (data.lessons) {
    Object.keys(data.lessons).forEach(k => {
      const e = data.lessons[k];
      result.push({ type: 'lesson', ...e });
    });
  }
  if (data.plans) {
    Object.keys(data.plans).forEach(k => {
      const e = data.plans[k];
      result.push({ type: 'plan', ...e });
    });
  }
  if (data.checklists) {
    Object.keys(data.checklists).forEach(k => {
      const e = data.checklists[k];
      result.push({ type: 'checklist', ...e });
    });
  }
  if (data.others) {
    Object.keys(data.others).forEach(k => {
      const e = data.others[k];
      result.push({ ...e });
    });
  }
  return result;
}

function array_to_index(arr) {
  const obj = { lessons: {}, plans: {}, checklists: {} };
  arr.forEach(e => {
    if (!e || !e.path) return;
    const base = path.basename(e.path);
    if (e.type === 'lesson') {
      const m = base.match(/(\d+)/);
      const key = m ? m[1].replace(/^0+/, '') : base;
      obj.lessons[key] = { ...e };
    } else if (e.type === 'plan') {
      const key = e.title || base;
      obj.plans[key] = { ...e };
    } else if (e.type === 'checklist') {
      const key = e.title || base;
      obj.checklists[key] = { ...e };
    } else if (e.type === 'profile') {
      obj.profile = { ...e };
    } else {
      if (!obj.others) obj.others = {};
      const key = e.title || base;
      obj.others[key] = { ...e };
    }
  });
  if (!Object.keys(obj.lessons).length) delete obj.lessons;
  if (!Object.keys(obj.plans).length) delete obj.plans;
  if (!Object.keys(obj.checklists).length) delete obj.checklists;
  if (obj.others && !Object.keys(obj.others).length) delete obj.others;
  return obj;
}

module.exports = { index_to_array, array_to_index };
