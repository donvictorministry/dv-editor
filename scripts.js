/* ===================== DV-EDITOR APPLICATION SCRIPT ===================== */
'use strict';

const DV = {
  db: null,
  editors: {},
  activeTab: 'html',
  currentFileId: null,
  lineNumbers: true,
  wordWrap: false,
  deferredPrompt: null,
  accentColors: [
    { name:'Facebook Blue', hex:'#1877F2' },
    { name:'Emerald',       hex:'#10B981' },
    { name:'Crimson',       hex:'#E0245E' },
    { name:'Amber',         hex:'#F59E0B' },
    { name:'Violet',        hex:'#8B5CF6' },
    { name:'Teal',          hex:'#14B8A6' },
    { name:'Orange',        hex:'#F97316' },
    { name:'Rose',          hex:'#FB7185' },
    { name:'Indigo',        hex:'#6366F1' },
    { name:'Slate',         hex:'#475569' }
  ],
  contextTargetId: null
};

/* ===================== INDEXEDDB ===================== */
const DV_DB_NAME = 'dvEditorDB';
const DV_DB_VERSION = 1;
const DV_STORE = 'dvFiles';

function dvOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DV_DB_NAME, DV_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DV_STORE)) {
        const store = db.createObjectStore(DV_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function dvSaveFileRecord(record) {
  return new Promise((resolve, reject) => {
    const tx = DV.db.transaction(DV_STORE, 'readwrite');
    tx.objectStore(DV_STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => reject(e.target.error);
  });
}

function dvDeleteFileRecord(id) {
  return new Promise((resolve, reject) => {
    const tx = DV.db.transaction(DV_STORE, 'readwrite');
    tx.objectStore(DV_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function dvGetAllFiles() {
  return new Promise((resolve, reject) => {
    const tx = DV.db.transaction(DV_STORE, 'readonly');
    const req = tx.objectStore(DV_STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = (e) => reject(e.target.error);
  });
}

function dvGetFile(id) {
  return new Promise((resolve, reject) => {
    const tx = DV.db.transaction(DV_STORE, 'readonly');
    const req = tx.objectStore(DV_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/* ===================== TOAST ===================== */
let dvToastTimer = null;
function dvToast(msg) {
  const el = document.getElementById('dv-toast');
  el.textContent = msg;
  el.classList.add('dv-toast-show');
  clearTimeout(dvToastTimer);
  dvToastTimer = setTimeout(() => el.classList.remove('dv-toast-show'), 1800);
}

/* ===================== CODEMIRROR SETUP ===================== */
function dvInitEditors() {
  const commonOpts = {
    lineNumbers: DV.lineNumbers,
    lineWrapping: DV.wordWrap,
    theme: 'material-darker',
    autoCloseBrackets: true,
    autoCloseTags: true,
    styleActiveLine: true,
    tabSize: 2,
    indentUnit: 2,
    viewportMargin: 500
  };

  DV.editors.html = CodeMirror.fromTextArea(document.getElementById('dv-ta-html'), {
    ...commonOpts, mode: 'htmlmixed',
    value: dvDefaultHTML()
  });
  DV.editors.css = CodeMirror.fromTextArea(document.getElementById('dv-ta-css'), {
    ...commonOpts, mode: 'css',
    value: dvDefaultCSS()
  });
  DV.editors.js = CodeMirror.fromTextArea(document.getElementById('dv-ta-js'), {
    ...commonOpts, mode: 'javascript',
    value: dvDefaultJS()
  });

  DV.editors.html.setValue(dvDefaultHTML());
  DV.editors.css.setValue(dvDefaultCSS());
  DV.editors.js.setValue(dvDefaultJS());
  dvApplyCMTheme();
}

function dvDefaultHTML() {
  return '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>My Project</title>\n</head>\n<body>\n  <h1>Hello DV-Editor</h1>\n</body>\n</html>';
}
function dvDefaultCSS() {
  return 'body {\n  font-family: sans-serif;\n  padding: 20px;\n}';
}
function dvDefaultJS() {
  return 'console.log("DV-Editor project running");';
}

function dvApplyCMTheme() {
  const isDark = document.documentElement.getAttribute('data-dv-theme') === 'dark';
  Object.values(DV.editors).forEach(cm => {
    cm.setOption('theme', isDark ? 'material-darker' : 'default');
    cm.refresh();
  });
}

function dvActiveEditor() {
  return DV.editors[DV.activeTab];
}

/* ===================== TAB SWITCHING ===================== */
function dvSwitchTab(tab) {
  DV.activeTab = tab;
  document.querySelectorAll('.dv-tab').forEach(t => {
    t.classList.toggle('dv-tab-active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.dv-cm-pane').forEach(p => p.classList.remove('dv-cm-pane-active'));
  document.getElementById('dv-cm-' + tab).classList.add('dv-cm-pane-active');
  setTimeout(() => dvActiveEditor().refresh(), 30);
}

/* ===================== TOOLSBAR ACTIONS ===================== */
function dvBindToolsbar() {
  document.querySelectorAll('.dv-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => dvHandleTool(btn.dataset.action, btn));
  });
}

function dvHandleTool(action, btn) {
  const cm = dvActiveEditor();
  switch (action) {
    case 'new':
      dvShowConfirm('This will clear the current ' + DV.activeTab.toUpperCase() + ' content. Continue?', () => {
        cm.setValue('');
        dvToast(DV.activeTab.toUpperCase() + ' cleared');
      }, 'Clear');
      break;
    case 'undo':
      cm.undo();
      break;
    case 'redo':
      cm.redo();
      break;
    case 'paste':
      dvPasteFromClipboard(cm);
      break;
    case 'copy':
      dvCopyToClipboard(cm);
      break;
    case 'delete':
      dvShowConfirm('Delete this file permanently?', async () => {
        if (DV.currentFileId) {
          await dvDeleteFileRecord(DV.currentFileId);
          dvToast('File deleted');
          await dvRenderFileList();
          dvCloseEditor();
        } else {
          dvToast('Nothing to delete');
        }
      }, 'Delete');
      break;
    case 'save':
      dvOpenSaveModal();
      break;
    case 'line':
      DV.lineNumbers = !DV.lineNumbers;
      Object.values(DV.editors).forEach(e => e.setOption('lineNumbers', DV.lineNumbers));
      btn.classList.toggle('dv-tool-active', DV.lineNumbers);
      dvToast('Line numbers ' + (DV.lineNumbers ? 'on' : 'off'));
      break;
    case 'wrap':
      DV.wordWrap = !DV.wordWrap;
      Object.values(DV.editors).forEach(e => e.setOption('lineWrapping', DV.wordWrap));
      btn.classList.toggle('dv-tool-active', DV.wordWrap);
      dvToast('Word wrap ' + (DV.wordWrap ? 'on' : 'off'));
      break;
    case 'search':
      dvOpenSearchModal();
      break;
    case 'preview':
      dvOpenPreview();
      break;
  }
}

async function dvPasteFromClipboard(cm) {
  try {
    const text = await navigator.clipboard.readText();
    cm.replaceSelection(text);
    dvToast('Pasted');
  } catch (err) {
    dvToast('Clipboard access denied');
  }
}

function dvCopyToClipboard(cm) {
  const text = cm.getSelection() || cm.getValue();
  navigator.clipboard.writeText(text).then(() => {
    dvToast('Copied');
  }).catch(() => dvToast('Copy failed'));
}

/* ===================== SEARCH MODAL ===================== */
function dvOpenSearchModal() {
  dvShowModal('dv-modal-search');
  const input = document.getElementById('dv-modal-search-input');
  input.value = '';
  setTimeout(() => input.focus(), 100);
}

/* ===================== DV INDEPENDENT SEARCH HIGHLIGHT ===================== */
// Built independently of CodeMirror's own selection/focus machinery.
// We find the match ourselves in the raw text, convert that to a line/ch
// position, read its pixel coordinates (a neutral coordinate reader, not
// a behavior owner), then draw our OWN highlight box and scroll the
// scroller directly. None of this depends on the editor having focus.

let dvSearchHighlightEl = null;

function dvGetOrCreateHighlightEl(cm) {
  const wrapper = cm.getWrapperElement();
  let el = wrapper.querySelector('.dv-search-highlight');
  if (!el) {
    el = document.createElement('div');
    el.className = 'dv-search-highlight';
    wrapper.appendChild(el);
  }
  return el;
}

function dvClearSearchHighlight() {
  if (dvSearchHighlightEl) {
    dvSearchHighlightEl.remove();
    dvSearchHighlightEl = null;
  }
}

// Convert a flat character index in the full text back into {line, ch}.
function dvIndexToLineCh(text, index) {
  const before = text.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}

// Find a match ourselves (plain substring, case-insensitive) starting
// from a given character index, wrapping to the top if nothing is found.
function dvFindMatch(text, term, fromIndex) {
  const hay = text.toLowerCase();
  const needle = term.toLowerCase();
  let idx = hay.indexOf(needle, fromIndex);
  let wrapped = false;
  if (idx === -1) {
    idx = hay.indexOf(needle, 0);
    wrapped = true;
  }
  if (idx === -1) return null;
  return { index: idx, length: term.length, wrapped: wrapped };
}

function dvHighlightAndCenter(cm, fromPos, toPos) {
  cm.refresh();

  const startCoords = cm.charCoords(fromPos, 'local');
  const endCoords = cm.charCoords(toPos, 'local');
  const editorEl = cm.getScrollerElement();

  // Vertical-only centering, computed and applied directly — no reliance
  // on CodeMirror scrolling/selection/focus behavior.
  const matchCenterY = (startCoords.top + endCoords.bottom) / 2;
  editorEl.scrollTop = Math.max(0, matchCenterY - editorEl.clientHeight / 2);

  // Draw our own highlight box positioned over the match, independent of
  // cm.setSelection() and independent of editor focus state.
  dvClearSearchHighlight();
  const highlightEl = dvGetOrCreateHighlightEl(cm);
  highlightEl.style.left = startCoords.left + 'px';
  highlightEl.style.top = startCoords.top + 'px';
  highlightEl.style.width = Math.max(6, endCoords.right - startCoords.left) + 'px';
  highlightEl.style.height = (endCoords.bottom - startCoords.top) + 'px';
  highlightEl.classList.add('dv-search-highlight-show');
  dvSearchHighlightEl = highlightEl;

  // Fade the highlight out on its own after a moment; it never depends on
  // focus or selection state to stay visible or to disappear.
  clearTimeout(dvHighlightAndCenter._t);
  dvHighlightAndCenter._t = setTimeout(() => {
    if (highlightEl) highlightEl.classList.remove('dv-search-highlight-show');
  }, 2200);
}

function dvEscapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dvRunSearch() {
  const term = document.getElementById('dv-modal-search-input').value;
  if (!term) { dvToast('Enter a search term'); return; }
  const cm = dvActiveEditor();
  const text = cm.getValue();
  const cursorPos = cm.getCursor();
  const cursorIndex = cm.indexFromPos(cursorPos);

  const match = dvFindMatch(text, term, cursorIndex + 1);

  // Close the modal and let the editor screen fully settle FIRST. Running
  // the highlight/scroll while the modal is still mid-transition is what
  // caused "found" to report true with nothing visible before.
  dvHideModal('dv-modal-search');

  if (!match) {
    dvToast('No matches found');
    return;
  }

  const fromLC = dvIndexToLineCh(text, match.index);
  const toLC = dvIndexToLineCh(text, match.index + match.length);
  const fromPos = { line: fromLC.line, ch: fromLC.ch };
  const toPos = { line: toLC.line, ch: toLC.ch };

  setTimeout(() => dvHighlightAndCenter(cm, fromPos, toPos), 220);
  dvToast(match.wrapped ? 'Match found (wrapped)' : 'Match found');
}

/* ===================== SAVE MODAL ===================== */
function dvOpenSaveModal() {
  dvShowModal('dv-modal-save');
  const input = document.getElementById('dv-modal-save-input');
  input.value = document.getElementById('dv-editor-filename').textContent === 'Untitled' ? '' : document.getElementById('dv-editor-filename').textContent;
  setTimeout(() => input.focus(), 100);
}

async function dvRunSave() {
  const name = document.getElementById('dv-modal-save-input').value.trim();
  if (!name) { dvToast('Enter a filename'); return; }

  const record = {
    id: DV.currentFileId || ('dv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    name: name,
    html: DV.editors.html.getValue(),
    css: DV.editors.css.getValue(),
    js: DV.editors.js.getValue(),
    updatedAt: Date.now()
  };
  await dvSaveFileRecord(record);
  DV.currentFileId = record.id;
  document.getElementById('dv-editor-filename').textContent = name;
  dvHideModal('dv-modal-save');
  dvToast('Saved');
  await dvRenderFileList();
}

/* ===================== GENERIC MODAL HELPERS ===================== */
function dvShowModal(id) {
  document.getElementById('dv-modal-overlay').classList.add('dv-overlay-active');
  document.getElementById(id).classList.add('dv-modal-open');
}
function dvHideModal(id) {
  document.getElementById('dv-modal-overlay').classList.remove('dv-overlay-active');
  document.getElementById(id).classList.remove('dv-modal-open');
}
function dvHideAllModals() {
  document.querySelectorAll('.dv-modal').forEach(m => m.classList.remove('dv-modal-open'));
  document.getElementById('dv-modal-overlay').classList.remove('dv-overlay-active');
}

let dvConfirmCallback = null;
function dvShowConfirm(text, callback, actionLabel) {
  document.getElementById('dv-modal-confirm-text').textContent = text;
  document.getElementById('dv-modal-confirm-ok').textContent = actionLabel || 'Delete';
  dvConfirmCallback = callback;
  dvShowModal('dv-modal-confirm');
}

/* ===================== PREVIEW ===================== */
function dvOpenPreview() {
  const html = DV.editors.html.getValue();
  const css = DV.editors.css.getValue();
  const js = DV.editors.js.getValue();

  let doc = html;
  const hasHead = /<head[^>]*>/i.test(doc);
  const hasBody = /<\/body>/i.test(doc);
  const styleTag = '<style>\n' + css + '\n</style>';
  const scriptTag = '<script>\n' + js + '\n<\/script>';

  if (hasHead) {
    doc = doc.replace(/<head[^>]*>/i, (m) => m + styleTag);
  } else {
    doc = styleTag + doc;
  }

  if (hasBody) {
    doc = doc.replace(/<\/body>/i, scriptTag + '</body>');
  } else {
    doc = doc + scriptTag;
  }

  const frame = document.getElementById('dv-preview-frame');
  frame.srcdoc = doc;

  document.getElementById('dv-preview-screen').classList.add('dv-screen-active');
}

function dvClosePreview() {
  document.getElementById('dv-preview-screen').classList.remove('dv-screen-active');
  document.getElementById('dv-preview-frame').srcdoc = 'about:blank';
}

/* ===================== EDITOR OPEN / CLOSE ===================== */
function dvOpenEditor(fileRecord) {
  if (fileRecord) {
    DV.currentFileId = fileRecord.id;
    document.getElementById('dv-editor-filename').textContent = fileRecord.name;
    DV.editors.html.setValue(fileRecord.html || '');
    DV.editors.css.setValue(fileRecord.css || '');
    DV.editors.js.setValue(fileRecord.js || '');
  } else {
    DV.currentFileId = null;
    document.getElementById('dv-editor-filename').textContent = 'Untitled';
    DV.editors.html.setValue(dvDefaultHTML());
    DV.editors.css.setValue(dvDefaultCSS());
    DV.editors.js.setValue(dvDefaultJS());
  }
  dvSwitchTab('html');
  document.getElementById('dv-editor-modal').classList.add('dv-screen-active');
  setTimeout(() => Object.values(DV.editors).forEach(e => e.refresh()), 50);
}

function dvCloseEditor() {
  document.getElementById('dv-editor-modal').classList.remove('dv-screen-active');
}

/* ===================== FILE LIST RENDERING ===================== */
async function dvRenderFileList() {
  const files = await dvGetAllFiles();
  const listEl = document.getElementById('dv-file-list');
  const emptyEl = document.getElementById('dv-empty-state');
  listEl.innerHTML = '';

  if (!files.length) {
    emptyEl.style.display = 'flex';
    listEl.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  listEl.style.display = 'flex';

  files.forEach(f => {
    const li = document.createElement('li');
    li.className = 'dv-file-item';
    li.dataset.id = f.id;
    const date = new Date(f.updatedAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    li.innerHTML =
      '<div class="dv-file-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6" fill="none"/></svg></div>' +
      '<div class="dv-file-meta"><div class="dv-file-name"></div><div class="dv-file-sub"></div></div>' +
      '<div class="dv-file-dots" data-id="' + f.id + '"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="19" r="1.8" fill="currentColor"/></svg></div>';
    li.querySelector('.dv-file-name').textContent = f.name;
    li.querySelector('.dv-file-sub').textContent = dateStr;
    listEl.appendChild(li);

    li.addEventListener('click', (e) => {
      if (e.target.closest('.dv-file-dots')) return;
      dvOpenEditor(f);
    });
    li.querySelector('.dv-file-dots').addEventListener('click', (e) => {
      e.stopPropagation();
      dvOpenContextMenu(f.id, e.currentTarget);
    });
  });
}

/* ===================== CONTEXT MENU (3-dots) ===================== */
function dvOpenContextMenu(id, anchorEl) {
  DV.contextTargetId = id;
  const menu = document.getElementById('dv-context-menu');
  const rect = anchorEl.getBoundingClientRect();
  menu.classList.add('dv-context-open');

  const menuWidth = 170;
  let left = rect.right - menuWidth;
  if (left < 10) left = 10;
  let top = rect.bottom + 4;
  if (top + 260 > window.innerHeight) top = rect.top - 264;

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  document.getElementById('dv-modal-overlay').classList.add('dv-overlay-active');
  document.getElementById('dv-modal-overlay').dataset.forContext = '1';
}

function dvCloseContextMenu() {
  document.getElementById('dv-context-menu').classList.remove('dv-context-open');
  if (document.getElementById('dv-modal-overlay').dataset.forContext) {
    document.getElementById('dv-modal-overlay').classList.remove('dv-overlay-active');
    delete document.getElementById('dv-modal-overlay').dataset.forContext;
  }
}

async function dvHandleContextAction(action) {
  const id = DV.contextTargetId;
  dvCloseContextMenu();
  if (!id) return;
  const file = await dvGetFile(id);
  if (!file && action !== 'exit') { dvToast('File not found'); return; }

  switch (action) {
    case 'rename':
      document.getElementById('dv-modal-rename-input').value = file.name;
      dvShowModal('dv-modal-rename');
      break;
    case 'edit':
    case 'open':
      dvOpenEditor(file);
      break;
    case 'delete':
      dvShowConfirm('Delete "' + file.name + '" permanently?', async () => {
        await dvDeleteFileRecord(id);
        dvToast('File deleted');
        await dvRenderFileList();
      }, 'Delete');
      break;
    case 'share':
      dvShareFile(file);
      break;
    case 'exit':
      break;
  }
}

async function dvRunRename() {
  const newName = document.getElementById('dv-modal-rename-input').value.trim();
  if (!newName) { dvToast('Enter a name'); return; }
  const id = DV.contextTargetId;
  const file = await dvGetFile(id);
  if (!file) { dvHideModal('dv-modal-rename'); return; }
  file.name = newName;
  file.updatedAt = Date.now();
  await dvSaveFileRecord(file);
  dvHideModal('dv-modal-rename');
  dvToast('Renamed');
  await dvRenderFileList();
}

function dvShareFile(file) {
  const bundle = '<!-- HTML -->\n' + file.html + '\n\n/* CSS */\n' + file.css + '\n\n// JS\n' + file.js;
  if (navigator.share) {
    navigator.share({ title: file.name, text: bundle }).catch(() => {});
  } else {
    navigator.clipboard.writeText(bundle).then(() => dvToast('Copied to clipboard'));
  }
}

/* ===================== SIDEBARS ===================== */
function dvOpenSidebar(side) {
  document.getElementById('dv-' + side + '-sidebar').classList.add('dv-sidebar-open');
  document.getElementById('dv-' + side + '-overlay').classList.add('dv-overlay-active');
}
function dvCloseSidebar(side) {
  document.getElementById('dv-' + side + '-sidebar').classList.remove('dv-sidebar-open');
  document.getElementById('dv-' + side + '-overlay').classList.remove('dv-overlay-active');
}

/* ===================== INFO PANEL CONTENT ===================== */
const DV_INFO_CONTENT = {
  'about-app': {
    title: 'About the App',
    html: '<h3>DV-Editor</h3><p>DV-Editor is a mobile-first, offline-capable code editor and web project sandbox for Android phones and tablets. It lets you write HTML, CSS, and JavaScript together and preview complete web projects instantly, all from your device.</p><p>Files and projects are stored locally on your device using IndexedDB, so your work persists across sessions without needing an internet connection.</p>'
  },
  'about-dev': {
    title: 'About the Developer',
    html: '<h3>Developer</h3><p>DV-Editor is built and maintained under the DV Architecture design system, developed for mobile-first, Android-native application experiences.</p>'
  },
  'how-to-use': {
    title: 'How to Use',
    html: '<h3>Getting Started</h3><p>Tap the + button on the home screen to open a new editor workspace.</p><h3>Editing</h3><p>Switch between HTML, CSS, and JS using the tabs below the toolsbar. Use the toolsbar to create new files, undo or redo changes, copy or paste content, search text, and save your work.</p><h3>Preview</h3><p>Tap Preview at any time to see your combined HTML, CSS, and JavaScript rendered live in full screen.</p><h3>Managing Files</h3><p>On the home screen, tap the three dots on any file to rename, edit, open, delete, or share it.</p>'
  },
  'proprietary': {
    title: 'Proprietary Software Notice',
    html: '<h3>Proprietary Notice</h3><p>DV-Editor and its source code, including all associated naming conventions, design system, and architecture, are proprietary. Unauthorized copying, redistribution, or cloning of this application or its source is not permitted without express written permission.</p>'
  },
  'terms': {
    title: 'Terms of Use',
    html: '<h3>Terms of Use</h3><p>This application is provided as-is for personal and educational use. By using DV-Editor, you agree to use it responsibly and acknowledge that all project data is stored locally on your device. The developer is not responsible for any data loss.</p>'
  },
  'contact': {
    title: 'Contact for Permission',
    html: '<h3>Contact</h3><p>For permission to use, modify, or redistribute any part of DV-Editor or its source code, please contact the developer directly through official channels.</p>'
  }
};

function dvOpenInfoPanel(key) {
  const data = DV_INFO_CONTENT[key];
  if (!data) return;
  document.getElementById('dv-info-title').textContent = data.title;
  document.getElementById('dv-info-content').innerHTML = data.html;
  document.getElementById('dv-info-panel').classList.add('dv-info-open');
  document.getElementById('dv-info-overlay').classList.add('dv-overlay-active');
}
function dvCloseInfoPanel() {
  document.getElementById('dv-info-panel').classList.remove('dv-info-open');
  document.getElementById('dv-info-overlay').classList.remove('dv-overlay-active');
}

/* ===================== THEME / ACCENT / FONT SETTINGS ===================== */
function dvBuildAccentGrid() {
  const grid = document.getElementById('dv-accent-grid');
  grid.innerHTML = '';
  DV.accentColors.forEach(c => {
    const sw = document.createElement('button');
    sw.className = 'dv-accent-swatch';
    sw.style.background = c.hex;
    sw.setAttribute('aria-label', c.name);
    sw.dataset.hex = c.hex;
    sw.addEventListener('click', () => dvSetAccent(c.hex));
    grid.appendChild(sw);
  });
}

function dvHexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r + ',' + g + ',' + b;
}

function dvSetAccent(hex, skipSave) {
  document.documentElement.style.setProperty('--dv-accent', hex);
  document.documentElement.style.setProperty('--dv-accent-rgb', dvHexToRgb(hex));
  document.querySelectorAll('.dv-accent-swatch').forEach(sw => {
    sw.classList.toggle('dv-accent-selected', sw.dataset.hex === hex);
  });
  if (!skipSave) localStorage.setItem('dvAccent', hex);
}

function dvSetFont(font, skipSave) {
  document.documentElement.style.setProperty('--dv-font', font === 'Roboto Mono' ? "'Roboto Mono',monospace" : font);
  if (!skipSave) localStorage.setItem('dvFont', font);
}

function dvSetFontScale(pct, skipSave) {
  document.documentElement.style.setProperty('--dv-font-scale', (pct / 100).toString());
  document.getElementById('dv-font-scale-val').textContent = pct + '%';
  Object.values(DV.editors).forEach(e => e.refresh());
  if (!skipSave) localStorage.setItem('dvFontScale', pct);
}

function dvSetDarkMode(isDark, skipSave) {
  document.documentElement.setAttribute('data-dv-theme', isDark ? 'dark' : 'light');
  document.getElementById('dv-dark-toggle').checked = isDark;
  dvApplyCMTheme();
  if (!skipSave) localStorage.setItem('dvDark', isDark ? '1' : '0');
}

function dvRestoreSettings() {
  const accent = localStorage.getItem('dvAccent') || '#1877F2';
  const font = localStorage.getItem('dvFont') || 'Roboto';
  const scale = parseInt(localStorage.getItem('dvFontScale') || '100', 10);
  const dark = localStorage.getItem('dvDark') === '1';

  dvSetAccent(accent, true);
  dvSetFont(font, true);
  dvSetFontScale(scale, true);
  dvSetDarkMode(dark, true);

  document.getElementById('dv-font-select').value = font;
  document.getElementById('dv-font-scale').value = scale;
}

/* ===================== PWA INSTALL / SHARE ===================== */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  DV.deferredPrompt = e;
});

function dvInstallApp() {
  if (DV.deferredPrompt) {
    DV.deferredPrompt.prompt();
    DV.deferredPrompt.userChoice.then(() => { DV.deferredPrompt = null; });
  } else {
    dvToast('App already installed or unsupported');
  }
}

function dvShareApp() {
  const shareData = { title: 'DV-Editor', text: 'Check out DV-Editor — a mobile code editor and project sandbox.', url: location.href };
  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(location.href).then(() => dvToast('Link copied'));
  }
}

/* ===================== SERVICE WORKER ===================== */
function dvRegisterSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ===================== EVENT BINDINGS ===================== */
function dvBindEvents() {
  document.getElementById('dv-fab').addEventListener('click', () => dvOpenEditor(null));
  document.getElementById('dv-editor-back').addEventListener('click', dvCloseEditor);

  document.querySelectorAll('.dv-tab').forEach(t => {
    t.addEventListener('click', () => dvSwitchTab(t.dataset.tab));
  });

  document.getElementById('dv-preview-close').addEventListener('click', dvClosePreview);

  document.getElementById('dv-left-menu-btn').addEventListener('click', () => dvOpenSidebar('left'));
  document.getElementById('dv-right-menu-btn').addEventListener('click', () => dvOpenSidebar('right'));
  document.getElementById('dv-left-overlay').addEventListener('click', () => dvCloseSidebar('left'));
  document.getElementById('dv-right-overlay').addEventListener('click', () => dvCloseSidebar('right'));
  document.querySelectorAll('.dv-sidebar-close').forEach(b => {
    b.addEventListener('click', () => dvCloseSidebar(b.dataset.close));
  });
  document.querySelectorAll('[data-close]').forEach(b => {
    b.addEventListener('click', () => dvCloseSidebar(b.dataset.close));
  });

  document.querySelectorAll('[data-panel]').forEach(b => {
    b.addEventListener('click', () => { dvCloseSidebar('left'); dvOpenInfoPanel(b.dataset.panel); });
  });
  document.getElementById('dv-info-close').addEventListener('click', dvCloseInfoPanel);
  document.getElementById('dv-info-overlay').addEventListener('click', dvCloseInfoPanel);

  // Confirm modal
  document.getElementById('dv-modal-confirm-cancel').addEventListener('click', () => dvHideModal('dv-modal-confirm'));
  document.getElementById('dv-modal-confirm-ok').addEventListener('click', () => {
    dvHideModal('dv-modal-confirm');
    if (dvConfirmCallback) { dvConfirmCallback(); dvConfirmCallback = null; }
  });

  // Save modal
  document.getElementById('dv-modal-save-cancel').addEventListener('click', () => dvHideModal('dv-modal-save'));
  document.getElementById('dv-modal-save-ok').addEventListener('click', dvRunSave);

  // Search modal
  document.getElementById('dv-modal-search-cancel').addEventListener('click', () => dvHideModal('dv-modal-search'));
  document.getElementById('dv-modal-search-ok').addEventListener('click', dvRunSearch);

  // Rename modal
  document.getElementById('dv-modal-rename-cancel').addEventListener('click', () => dvHideModal('dv-modal-rename'));
  document.getElementById('dv-modal-rename-ok').addEventListener('click', dvRunRename);

  // Context menu
  document.querySelectorAll('.dv-context-item').forEach(item => {
    item.addEventListener('click', () => dvHandleContextAction(item.dataset.menu));
  });

  // Overlay click closes context menu / modals appropriately
  document.getElementById('dv-modal-overlay').addEventListener('click', () => {
    if (document.getElementById('dv-context-menu').classList.contains('dv-context-open')) {
      dvCloseContextMenu();
    } else {
      dvHideAllModals();
    }
  });

  // Settings
  document.getElementById('dv-font-select').addEventListener('change', (e) => dvSetFont(e.target.value));
  document.getElementById('dv-font-scale').addEventListener('input', (e) => dvSetFontScale(parseInt(e.target.value, 10)));
  document.getElementById('dv-dark-toggle').addEventListener('change', (e) => dvSetDarkMode(e.target.checked));
  document.getElementById('dv-install-btn').addEventListener('click', dvInstallApp);
  document.getElementById('dv-share-app-btn').addEventListener('click', dvShareApp);

  dvBindToolsbar();
}

/* ===================== SEED PROJECT (3-FILE TEST) ===================== */
function dvWallpaperHTML() {
  return '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>DV Wallpaper</title>\n</head>\n<body>\n  <div class="dv-wp-stage">\n    <div class="dv-wp-orb dv-wp-orb-1"></div>\n    <div class="dv-wp-orb dv-wp-orb-2"></div>\n    <div class="dv-wp-orb dv-wp-orb-3"></div>\n    <h1 class="dv-wp-label">DV-Editor</h1>\n  </div>\n</body>\n</html>';
}
function dvWallpaperCSS() {
  return 'html, body {\n  margin: 0;\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n  background: #0E0F11;\n}\n\n.dv-wp-stage {\n  position: relative;\n  width: 100vw;\n  height: 100vh;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: linear-gradient(160deg, #0E0F11 0%, #101425 60%, #1877F2 140%);\n  overflow: hidden;\n}\n\n.dv-wp-orb {\n  position: absolute;\n  border-radius: 50%;\n  filter: blur(40px);\n  opacity: 0.55;\n}\n\n.dv-wp-orb-1 {\n  width: 60vw;\n  height: 60vw;\n  background: #1877F2;\n  top: -15vw;\n  left: -10vw;\n}\n\n.dv-wp-orb-2 {\n  width: 45vw;\n  height: 45vw;\n  background: #8B5CF6;\n  bottom: -10vw;\n  right: -10vw;\n}\n\n.dv-wp-orb-3 {\n  width: 30vw;\n  height: 30vw;\n  background: #14B8A6;\n  bottom: 20vh;\n  left: 10vw;\n}\n\n.dv-wp-label {\n  position: relative;\n  z-index: 2;\n  color: #FFFFFF;\n  font-family: sans-serif;\n  font-weight: 700;\n  font-size: 8vw;\n  letter-spacing: 0.05em;\n  text-shadow: 0 4px 24px rgba(0,0,0,0.4);\n}';
}
function dvWallpaperJS() {
  return '// Gently drifts the orbs to prove HTML + CSS + JS are linked live\nconst dvOrbs = document.querySelectorAll(".dv-wp-orb");\nlet dvT = 0;\n\nfunction dvAnimateWallpaper() {\n  dvT += 0.01;\n  dvOrbs.forEach((orb, i) => {\n    const dx = Math.sin(dvT + i * 2) * 18;\n    const dy = Math.cos(dvT + i * 2) * 18;\n    orb.style.transform = "translate(" + dx + "px, " + dy + "px)";\n  });\n  requestAnimationFrame(dvAnimateWallpaper);\n}\n\ndvAnimateWallpaper();';
}

async function dvSeedWallpaperIfEmpty() {
  const existing = await dvGetAllFiles();
  if (existing.length > 0) return;

  const record = {
    id: 'dv_seed_wallpaper',
    name: 'DV Wallpaper (Test Project)',
    html: dvWallpaperHTML(),
    css: dvWallpaperCSS(),
    js: dvWallpaperJS(),
    updatedAt: Date.now()
  };
  await dvSaveFileRecord(record);
}

/* ===================== INIT ===================== */
async function dvInit() {
  try {
    DV.db = await dvOpenDB();
  } catch (err) {
    dvToast('Storage unavailable');
  }
  dvInitEditors();
  dvBuildAccentGrid();
  dvRestoreSettings();
  dvBindEvents();
  dvRegisterSW();
  if (DV.db) {
    await dvSeedWallpaperIfEmpty();
    await dvRenderFileList();
  }

  // Reflect initial toggle-button states
  document.querySelectorAll('.dv-tool-toggle').forEach(btn => {
    if (btn.dataset.action === 'line') btn.classList.toggle('dv-tool-active', DV.lineNumbers);
    if (btn.dataset.action === 'wrap') btn.classList.toggle('dv-tool-active', DV.wordWrap);
  });
}

document.addEventListener('DOMContentLoaded', dvInit);
