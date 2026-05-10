'use strict';

// ════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════

const STORE_KEY = 'storymap_v1';
const THEME_KEY = 'storymap_theme';

const CHAR_COLORS = [
  '#E07A5F', '#81B29A', '#F2CC8F', '#3D405B',
  '#F4A261', '#A8DADC', '#C77DFF', '#E9C46A'
];

const COVER_COLORS = [
  '#6B3A2A', '#2F4F4F', '#4A235A', '#1B3A4B',
  '#7A2020', '#1A3300', '#2C2C54', '#5C4033',
  '#1C3244', '#3B4A1C', '#704214', '#2D4A3E'
];

const ROLES = ['protagonist', 'antagonist', 'supporting', 'unknown'];
const ROLE_LABELS = { protagonist: 'Protagonist', antagonist: 'Antagonist', supporting: 'Supporting', unknown: 'Unknown' };
const ROLE_COLORS = { protagonist: '#E07A5F', antagonist: '#C77DFF', supporting: '#81B29A', unknown: '#A09080' };
const ROLE_BG = { protagonist: '#FDE8E4', antagonist: '#F0E8FF', supporting: '#E0F0E8', unknown: '#EBEBEB' };
const ROLE_BG_DARK = { protagonist: '#3D1A15', antagonist: '#2A1840', supporting: '#102820', unknown: '#252525' };

// ════════════════════════════════════════════
// DATA LAYER
// ════════════════════════════════════════════

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// In-memory cache — populated on startup from server, falls back to localStorage
let _storeCache = null;

function emptyStore() { return { books: [], characters: [], relationships: [] }; }

function loadStore() {
  // Always read from cache; the cache is authoritative after init
  if (_storeCache) return JSON.parse(JSON.stringify(_storeCache));
  // Pre-init fallback: read localStorage so CRUD works during the loading fetch
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    return (s && s.books) ? s : emptyStore();
  } catch { return emptyStore(); }
}

function saveStore(s) {
  _storeCache = s;
  // Keep localStorage in sync as an instant backup
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* quota */ }
  // Persist to the server file (debounced so rapid edits coalesce)
  _scheduleServerSave();
}

let _saveTimer = null;
function _scheduleServerSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_storeCache),
      });
    } catch { /* server unreachable — localStorage already has the data */ }
  }, 400);
}

async function _loadFromServer() {
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 3000);
    const res  = await fetch('/api/data', { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return false;
    const data = await res.json();
    if (data && Array.isArray(data.books)) {
      _storeCache = data;
      // Mirror to localStorage so the app still works if the server goes away
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* quota */ }
      return true;
    }
  } catch { /* timeout or network error */ }
  return false;
}

// ── Books ──
function getBooks() { return loadStore().books; }
function getBook(id) { return loadStore().books.find(b => b.id === id) || null; }

function createBook({ title, author = '', coverColor }) {
  const s = loadStore();
  const book = { id: uuid(), title: title.trim(), author: author.trim(), coverColor };
  s.books.push(book);
  saveStore(s);
  return book;
}

function updateBook(id, patch) {
  const s = loadStore();
  const i = s.books.findIndex(b => b.id === id);
  if (i >= 0) { s.books[i] = { ...s.books[i], ...patch }; saveStore(s); }
}

function deleteBook(id) {
  const s = loadStore();
  s.books = s.books.filter(b => b.id !== id);
  s.characters = s.characters.filter(c => c.bookId !== id);
  s.relationships = s.relationships.filter(r => r.bookId !== id);
  saveStore(s);
}

// ── Characters ──
function getCharacters(bookId) { return loadStore().characters.filter(c => c.bookId === bookId); }
function getCharacter(id) { return loadStore().characters.find(c => c.id === id) || null; }

function createCharacter({ bookId, name, alias = '', role = 'unknown', colorTag, description = '', notes = '' }) {
  const s = loadStore();
  const char = { id: uuid(), bookId, name: name.trim(), alias: alias.trim(), role, colorTag: colorTag || CHAR_COLORS[0], description: description.trim(), notes: notes.trim() };
  s.characters.push(char);
  saveStore(s);
  return char;
}

function updateCharacter(id, patch) {
  const s = loadStore();
  const i = s.characters.findIndex(c => c.id === id);
  if (i >= 0) {
    const p = { ...patch };
    if (p.name) p.name = p.name.trim();
    if (p.alias !== undefined) p.alias = p.alias.trim();
    if (p.description !== undefined) p.description = p.description.trim();
    if (p.notes !== undefined) p.notes = p.notes.trim();
    s.characters[i] = { ...s.characters[i], ...p };
    saveStore(s);
  }
}

function deleteCharacter(id) {
  const s = loadStore();
  s.characters = s.characters.filter(c => c.id !== id);
  s.relationships = s.relationships.filter(r => r.fromCharacterId !== id && r.toCharacterId !== id);
  saveStore(s);
}

// ── Relationships ──
function getRelationships(bookId) { return loadStore().relationships.filter(r => r.bookId === bookId); }
function getRelationship(id) { return loadStore().relationships.find(r => r.id === id) || null; }
function getCharacterRels(charId) {
  return loadStore().relationships.filter(r => r.fromCharacterId === charId || r.toCharacterId === charId);
}

function createRelationship({ bookId, fromCharacterId, toCharacterId, label, direction = 'one-way' }) {
  const s = loadStore();
  const rel = { id: uuid(), bookId, fromCharacterId, toCharacterId, label: label.trim(), direction };
  s.relationships.push(rel);
  saveStore(s);
  return rel;
}

function updateRelationship(id, patch) {
  const s = loadStore();
  const i = s.relationships.findIndex(r => r.id === id);
  if (i >= 0) {
    const p = { ...patch };
    if (p.label) p.label = p.label.trim();
    s.relationships[i] = { ...s.relationships[i], ...p };
    saveStore(s);
  }
}

function deleteRelationship(id) {
  const s = loadStore();
  s.relationships = s.relationships.filter(r => r.id !== id);
  saveStore(s);
}

// ── Export / Import ──
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBook(bookId) {
  const book = getBook(bookId);
  if (!book) return;
  downloadJSON({
    storymap_version: '1', type: 'book',
    book, characters: getCharacters(bookId), relationships: getRelationships(bookId)
  }, `${book.title}.storymap.json`);
}

function exportCharacter(charId) {
  const char = getCharacter(charId);
  if (!char) return;
  downloadJSON({
    storymap_version: '1', type: 'character',
    character: char, relationships: getCharacterRels(charId)
  }, `${char.name}.storymap-character.json`);
}

function importBook(json) {
  if (json.type !== 'book' || !json.book) throw new Error('Not a valid book export.');
  const idMap = {};
  const newBookId = uuid();
  idMap[json.book.id] = newBookId;
  const newBook = { ...json.book, id: newBookId };
  const newChars = (json.characters || []).map(c => {
    const newId = uuid();
    idMap[c.id] = newId;
    return { ...c, id: newId, bookId: newBookId };
  });
  const newRels = (json.relationships || []).map(r => ({
    ...r, id: uuid(), bookId: newBookId,
    fromCharacterId: idMap[r.fromCharacterId] || r.fromCharacterId,
    toCharacterId: idMap[r.toCharacterId] || r.toCharacterId,
  }));
  const s = loadStore();
  s.books.push(newBook);
  s.characters.push(...newChars);
  s.relationships.push(...newRels);
  saveStore(s);
  return newBook;
}

function importCharacter(bookId, json) {
  if (json.type !== 'character' || !json.character) throw new Error('Not a valid character export.');
  const existingChars = getCharacters(bookId);
  const existingIds = new Set(existingChars.map(c => c.id));
  const idMap = {};
  const newCharId = uuid();
  idMap[json.character.id] = newCharId;
  const newChar = { ...json.character, id: newCharId, bookId };
  const unknownCache = {};

  function resolveId(origId) {
    if (idMap[origId]) return idMap[origId];
    if (existingIds.has(origId)) return origId;
    if (!unknownCache[origId]) {
      const ph = uuid();
      unknownCache[origId] = ph;
      const s = loadStore();
      s.characters.push({ id: ph, bookId, name: '[Unknown Character]', alias: '', role: 'unknown', colorTag: '#888888', description: 'Imported from another book.', notes: '' });
      saveStore(s);
    }
    return unknownCache[origId];
  }

  const newRels = (json.relationships || []).map(r => ({
    ...r, id: uuid(), bookId,
    fromCharacterId: resolveId(r.fromCharacterId),
    toCharacterId: resolveId(r.toCharacterId),
  }));

  const s = loadStore();
  s.characters.push(newChar);
  s.relationships.push(...newRels);
  saveStore(s);
  return newChar;
}

// ════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'auto';
}

function applyTheme(theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  localStorage.setItem(THEME_KEY, theme);
  updateThemeButtons();
}

function toggleTheme() {
  const current = getTheme();
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveDark = current === 'dark' || (current === 'auto' && systemDark);
  applyTheme(effectiveDark ? 'light' : 'dark');
}

function themeIcon() {
  const t = getTheme();
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveDark = t === 'dark' || (t === 'auto' && systemDark);
  return effectiveDark ? '☀️' : '🌙';
}

function updateThemeButtons() {
  document.querySelectorAll('.theme-toggle').forEach(b => { b.textContent = themeIcon(); });
}

// ════════════════════════════════════════════
// APP STATE
// ════════════════════════════════════════════

const State = {
  screen: 'bookshelf',   // 'bookshelf' | 'workspace' | 'char-detail'
  bookId: null,
  charId: null,
  tab: 'characters',     // 'characters' | 'mindmap'
};

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════

let _toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ════════════════════════════════════════════
// MODAL SYSTEM
// ════════════════════════════════════════════

let _modalStack = [];

function openModal({ content, centered = false, onClose }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop' + (centered ? ' centered' : '');

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal();
  });

  backdrop.innerHTML = content;
  root.appendChild(backdrop);
  _modalStack.push({ el: backdrop, onClose });

  // Focus first input
  setTimeout(() => {
    const inp = backdrop.querySelector('input:not([type=hidden]),textarea');
    if (inp) inp.focus();
  }, 50);

  return backdrop;
}

function closeModal() {
  if (!_modalStack.length) return;
  const { el, onClose } = _modalStack.pop();
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.18s';
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 180);
  if (onClose) onClose();
}

function closeAllModals() {
  while (_modalStack.length) closeModal();
}

// ════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════

function navigate(screen, params = {}) {
  // Stop any running mind map simulation when leaving the workspace
  if (State.screen !== screen && _mm && _mm.stopSim) _mm.stopSim();
  const prev = State.screen;
  Object.assign(State, params);
  State.screen = screen;

  const screens = {
    bookshelf: document.getElementById('screen-bookshelf'),
    workspace: document.getElementById('screen-workspace'),
    'char-detail': document.getElementById('screen-char-detail'),
  };

  Object.entries(screens).forEach(([name, el]) => {
    el.classList.remove('active', 'slide-left');
    if (name === screen) {
      el.classList.add('active');
    } else if (name === prev && screen !== prev) {
      el.classList.add('slide-left');
    }
  });

  closeAllModals();
  renderScreen(screen);
}

function renderScreen(screen) {
  if (screen === 'bookshelf') renderBookshelf();
  else if (screen === 'workspace') renderWorkspace();
  else if (screen === 'char-detail') renderCharDetail();
}

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isDark() {
  const t = getTheme();
  return t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function roleBadgeStyle(role) {
  const bg = isDark() ? ROLE_BG_DARK[role] : ROLE_BG[role];
  return `background:${bg};color:${ROLE_COLORS[role]};`;
}

// ════════════════════════════════════════════
// RENDER: BOOKSHELF
// ════════════════════════════════════════════

function renderBookshelf() {
  const el = document.getElementById('screen-bookshelf');
  const books = getBooks();

  el.innerHTML = `
    <header class="app-header">
      <h1>📖 StoryMap</h1>
      <button class="icon-btn theme-toggle" onclick="toggleTheme()">${themeIcon()}</button>
    </header>
    <div class="screen-content" id="bookshelf-content">
      <div class="bookshelf-toolbar">
        <button class="btn-import" id="btn-import-book">📥 Import Book</button>
      </div>
      ${books.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📚</div>
          <div class="empty-title">Your bookshelf is empty</div>
          <div class="empty-text">Tap the + button to add your first book and start tracking characters.</div>
        </div>
      ` : `
        <div class="book-grid" id="book-grid">
          ${books.map(b => renderBookCard(b)).join('')}
        </div>
      `}
    </div>
    <button class="fab" id="fab-new-book" title="New Book">＋</button>
  `;

  el.querySelector('#fab-new-book').addEventListener('click', () => openNewBookModal());
  el.querySelector('#btn-import-book').addEventListener('click', () => {
    document.getElementById('file-import-book').click();
  });

  // Book card events
  el.querySelectorAll('.book-card').forEach(card => {
    const bookId = card.dataset.id;
    let longPressTimer = null;

    card.addEventListener('click', e => {
      if (e.target.closest('.card-icon-btn')) return;
      if (card.classList.contains('show-actions')) {
        card.classList.remove('show-actions');
        return;
      }
      navigate('workspace', { bookId, tab: 'characters' });
    });

    card.addEventListener('touchstart', e => {
      longPressTimer = setTimeout(() => {
        card.classList.add('show-actions');
      }, 500);
    }, { passive: true });

    card.addEventListener('touchend', () => clearTimeout(longPressTimer), { passive: true });
    card.addEventListener('touchmove', () => clearTimeout(longPressTimer), { passive: true });

    card.querySelector('.btn-export-book')?.addEventListener('click', e => {
      e.stopPropagation();
      exportBook(bookId);
      showToast('Book exported!');
    });

    card.querySelector('.btn-edit-book')?.addEventListener('click', e => {
      e.stopPropagation();
      card.classList.remove('show-actions');
      openEditBookModal(bookId);
    });

    card.querySelector('.btn-delete-book')?.addEventListener('click', e => {
      e.stopPropagation();
      card.classList.remove('show-actions');
      confirmDelete('Delete this book?', 'This will also delete all its characters and relationships.', () => {
        deleteBook(bookId);
        renderBookshelf();
        showToast('Book deleted.');
      });
    });
  });

  // Close context menus on outside click
  document.addEventListener('click', closeAllContextMenus, { once: true });
}

function renderBookCard(book) {
  return `
    <div class="book-card" data-id="${book.id}" style="--cover:${book.coverColor}">
      <div class="book-cover" style="background:${book.coverColor}">
        <div class="book-cover-spine"></div>
        <span class="book-cover-icon">📖</span>
      </div>
      <div class="book-card-actions">
        <button class="card-icon-btn btn-export-book" title="Export">⬇</button>
        <button class="card-icon-btn btn-edit-book" title="Edit">✎</button>
        <button class="card-icon-btn btn-delete-book" title="Delete">✕</button>
      </div>
      <div class="book-info">
        <div class="book-title">${esc(book.title)}</div>
        ${book.author ? `<div class="book-author">${esc(book.author)}</div>` : ''}
      </div>
    </div>
  `;
}

// ════════════════════════════════════════════
// BOOK FORM MODALS
// ════════════════════════════════════════════

function bookFormHTML(book = null) {
  const title = book ? esc(book.title) : '';
  const author = book ? esc(book.author) : '';
  const cover = book ? book.coverColor : COVER_COLORS[0];
  const swatches = COVER_COLORS.map(c =>
    `<div class="cover-swatch${c === cover ? ' selected' : ''}" data-color="${c}" style="background:${c}" title="${c}"></div>`
  ).join('');
  return `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h3>${book ? 'Edit Book' : 'New Book'}</h3>
        <button class="icon-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Title *</label>
          <input class="form-input" id="bk-title" value="${title}" placeholder="Book title" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Author</label>
          <input class="form-input" id="bk-author" value="${author}" placeholder="Author name (optional)" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Cover Color</label>
          <div class="cover-color-picker" id="cover-picker">${swatches}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="bk-save">${book ? 'Save Changes' : 'Add Book'}</button>
      </div>
    </div>
  `;
}

function openNewBookModal() {
  const bd = openModal({ content: bookFormHTML() });
  bindBookForm(bd, null);
}

function openEditBookModal(bookId) {
  const book = getBook(bookId);
  const bd = openModal({ content: bookFormHTML(book) });
  bindBookForm(bd, bookId);
}

function bindBookForm(bd, bookId) {
  let selectedColor = bookId ? getBook(bookId).coverColor : COVER_COLORS[0];

  bd.querySelectorAll('.cover-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      bd.querySelectorAll('.cover-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  const titleIn = bd.querySelector('#bk-title');
  const saveBtn = bd.querySelector('#bk-save');

  function checkValid() {
    saveBtn.disabled = !titleIn.value.trim();
  }

  titleIn.addEventListener('input', checkValid);
  checkValid();

  saveBtn.addEventListener('click', () => {
    const title = titleIn.value.trim();
    const author = bd.querySelector('#bk-author').value.trim();
    if (!title) return;
    if (bookId) {
      updateBook(bookId, { title, author, coverColor: selectedColor });
      showToast('Book updated!');
    } else {
      createBook({ title, author, coverColor: selectedColor });
      showToast('Book added!');
    }
    closeModal();
    renderBookshelf();
  });
}

// ════════════════════════════════════════════
// RENDER: WORKSPACE
// ════════════════════════════════════════════

function renderWorkspace() {
  const el = document.getElementById('screen-workspace');
  const book = getBook(State.bookId);
  if (!book) { navigate('bookshelf'); return; }

  el.innerHTML = `
    <header class="app-header">
      <button class="icon-btn" id="ws-back">←</button>
      <h2>${esc(book.title)}</h2>
      <button class="icon-btn theme-toggle" onclick="toggleTheme()">${themeIcon()}</button>
    </header>
    <div class="tab-bar">
      <button class="tab-btn${State.tab === 'characters' ? ' active' : ''}" data-tab="characters">Characters</button>
      <button class="tab-btn${State.tab === 'mindmap' ? ' active' : ''}" data-tab="mindmap">Mind Map</button>
    </div>
    <div id="tab-characters" style="display:${State.tab === 'characters' ? 'flex' : 'none'};flex-direction:column;flex:1;overflow:hidden;">
      <div class="screen-content" id="char-list-scroll"></div>
      <button class="fab" id="fab-add-char" title="Add Character">＋</button>
    </div>
    <div id="tab-mindmap" style="display:${State.tab === 'mindmap' ? 'flex' : 'none'};flex:1;overflow:hidden;flex-direction:column;">
      <div id="mindmap-container">
        <svg id="mindmap-svg" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
    </div>
  `;

  el.querySelector('#ws-back').addEventListener('click', () => navigate('bookshelf'));

  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.tab = btn.dataset.tab;
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === State.tab));
      el.querySelector('#tab-characters').style.display = State.tab === 'characters' ? 'flex' : 'none';
      el.querySelector('#tab-mindmap').style.display = State.tab === 'mindmap' ? 'flex' : 'none';
      if (State.tab === 'mindmap') initMindMap();
    });
  });

  el.querySelector('#fab-add-char').addEventListener('click', () => openCharForm(null));

  renderCharList();
  if (State.tab === 'mindmap') initMindMap();
}

function renderCharList() {
  const container = document.getElementById('char-list-scroll');
  if (!container) return;
  const chars = getCharacters(State.bookId);
  const toolbar = `
    <div style="padding:10px 14px 0;display:flex;justify-content:flex-end;">
      <button class="btn-import" id="btn-import-char" style="font-size:0.82rem;">📥 Import Character</button>
    </div>`;

  if (chars.length === 0) {
    container.innerHTML = toolbar + `
      <div class="empty-state">
        <div class="empty-icon">🧑‍🤝‍🧑</div>
        <div class="empty-title">No characters yet</div>
        <div class="empty-text">Tap the + button to add your first character.</div>
      </div>`;
  } else {
    container.innerHTML = toolbar + `<div class="char-list">${chars.map(c => `
      <div class="char-card" data-id="${c.id}">
        <div class="color-dot" style="background:${c.colorTag}"></div>
        <div class="char-card-info">
          <div class="char-name">${esc(c.name)}</div>
          ${c.alias ? `<div class="char-alias">${esc(c.alias)}</div>` : ''}
        </div>
        <span class="role-badge" style="${roleBadgeStyle(c.role)}">${ROLE_LABELS[c.role]}</span>
      </div>
    `).join('')}</div>`;

    container.querySelectorAll('.char-card').forEach(card => {
      card.addEventListener('click', () => navigate('char-detail', { charId: card.dataset.id }));
    });
  }

  container.querySelector('#btn-import-char')?.addEventListener('click', () => {
    document.getElementById('file-import-char').click();
  });
}

// ════════════════════════════════════════════
// CHARACTER FORM
// ════════════════════════════════════════════

function charFormHTML(char = null) {
  const name = char ? esc(char.name) : '';
  const alias = char ? esc(char.alias) : '';
  const role = char ? char.role : 'unknown';
  const color = char ? char.colorTag : CHAR_COLORS[0];
  const desc = char ? esc(char.description) : '';
  const notes = char ? esc(char.notes) : '';

  const swatches = CHAR_COLORS.map(c =>
    `<div class="color-swatch${c === color ? ' selected' : ''}" data-color="${c}" style="background:${c}"></div>`
  ).join('');

  const roleSegs = ROLES.map(r =>
    `<button class="seg-btn${r === role ? ' active' : ''}" data-role="${r}">${ROLE_LABELS[r]}</button>`
  ).join('');

  return `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h3>${char ? 'Edit Character' : 'Add Character'}</h3>
        <button class="icon-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Name *</label>
          <input class="form-input" id="ch-name" value="${name}" placeholder="Character name" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Alias / Nickname</label>
          <input class="form-input" id="ch-alias" value="${alias}" placeholder="e.g. The Dark Lord" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <div class="segmented" id="ch-role">${roleSegs}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Color Tag</label>
          <div class="color-picker" id="ch-color">${swatches}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-textarea" id="ch-desc" placeholder="Who is this character?">${desc}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="ch-notes" placeholder="e.g. First appears in chapter 4">${notes}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="ch-save">${char ? 'Save Changes' : 'Add Character'}</button>
      </div>
    </div>
  `;
}

function openCharForm(charId) {
  const char = charId ? getCharacter(charId) : null;
  const bd = openModal({ content: charFormHTML(char) });

  let selectedRole = char ? char.role : 'unknown';
  let selectedColor = char ? char.colorTag : CHAR_COLORS[0];

  bd.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bd.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRole = btn.dataset.role;
    });
  });

  bd.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      bd.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  const nameIn = bd.querySelector('#ch-name');
  const saveBtn = bd.querySelector('#ch-save');

  function checkValid() { saveBtn.disabled = !nameIn.value.trim(); }
  nameIn.addEventListener('input', checkValid);
  checkValid();

  saveBtn.addEventListener('click', () => {
    const name = nameIn.value.trim();
    if (!name) return;
    const data = {
      name,
      alias: bd.querySelector('#ch-alias').value,
      role: selectedRole,
      colorTag: selectedColor,
      description: bd.querySelector('#ch-desc').value,
      notes: bd.querySelector('#ch-notes').value,
    };
    if (charId) {
      updateCharacter(charId, data);
      showToast('Character updated!');
      closeModal();
      renderCharDetail();
    } else {
      createCharacter({ bookId: State.bookId, ...data });
      showToast('Character added!');
      closeModal();
      renderCharList();
    }
  });
}

// ════════════════════════════════════════════
// RENDER: CHARACTER DETAIL
// ════════════════════════════════════════════

function renderCharDetail() {
  const el = document.getElementById('screen-char-detail');
  const char = getCharacter(State.charId);
  if (!char) { navigate('workspace'); return; }

  const rels = getCharacterRels(char.id);
  const allChars = getCharacters(char.bookId);
  const charMap = Object.fromEntries(allChars.map(c => [c.id, c]));

  const relsHTML = rels.length === 0
    ? `<p style="color:var(--text-muted);font-size:0.88rem;">No relationships yet.</p>`
    : rels.map(r => {
        const isFrom = r.fromCharacterId === char.id;
        const otherId = isFrom ? r.toCharacterId : r.fromCharacterId;
        const other = charMap[otherId];
        const otherName = other ? other.name : '[Unknown]';
        const otherColor = other ? other.colorTag : '#888';
        let dirIcon, dirText;
        if (r.direction === 'mutual') {
          dirIcon = '↔';
          dirText = `${esc(char.name)} ↔ ${esc(otherName)}`;
        } else if (isFrom) {
          dirIcon = '→';
          dirText = `${esc(char.name)} → ${esc(otherName)}`;
        } else {
          dirIcon = '←';
          dirText = `${esc(otherName)} → ${esc(char.name)}`;
        }
        return `
          <div class="rel-item" data-rel-id="${r.id}">
            <div class="color-dot" style="background:${otherColor}"></div>
            <div class="rel-info">
              <div class="rel-label">${esc(r.label)}</div>
              <div class="rel-other">${dirText}</div>
            </div>
            <span class="rel-dir-icon">${dirIcon}</span>
          </div>
        `;
      }).join('');

  el.innerHTML = `
    <header class="app-header">
      <button class="icon-btn" id="cd-back">←</button>
      <h2>${esc(char.name)}</h2>
      <button class="icon-btn theme-toggle" onclick="toggleTheme()">${themeIcon()}</button>
    </header>
    <div class="screen-content">
      <div class="char-detail-hero">
        <div class="char-detail-dot" style="background:${char.colorTag}"></div>
        <div class="char-detail-hero-info">
          <h2>${esc(char.name)}</h2>
          ${char.alias ? `<div class="char-detail-alias">"${esc(char.alias)}"</div>` : ''}
          <span class="role-badge" style="${roleBadgeStyle(char.role)}">${ROLE_LABELS[char.role]}</span>
        </div>
      </div>

      ${char.description ? `
        <div class="char-detail-section">
          <h3>Description</h3>
          <p>${esc(char.description)}</p>
        </div>` : ''}

      ${char.notes ? `
        <div class="char-detail-section">
          <h3>Notes</h3>
          <p>${esc(char.notes)}</p>
        </div>` : ''}

      <div class="char-detail-actions">
        <button class="btn btn-secondary" id="cd-edit">✎ Edit</button>
        <button class="btn btn-ghost" id="cd-export">⬇ Export</button>
        <button class="btn btn-danger" id="cd-delete">🗑</button>
      </div>

      <div class="char-detail-section">
        <h3>Relationships</h3>
        <div id="rels-list">${relsHTML}</div>
        <button class="btn btn-primary" id="cd-add-rel" style="margin-top:8px;flex:none;width:100%;">+ Add Relationship</button>
      </div>
    </div>
  `;

  el.querySelector('#cd-back').addEventListener('click', () => navigate('workspace'));
  el.querySelector('#cd-edit').addEventListener('click', () => openCharForm(char.id));
  el.querySelector('#cd-export').addEventListener('click', () => { exportCharacter(char.id); showToast('Character exported!'); });
  el.querySelector('#cd-delete').addEventListener('click', () => {
    confirmDelete('Delete character?', `This will also remove all of ${char.name}'s relationships.`, () => {
      deleteCharacter(char.id);
      showToast('Character deleted.');
      navigate('workspace', { tab: 'characters' });
    });
  });

  el.querySelectorAll('.rel-item').forEach(item => {
    item.addEventListener('click', () => openRelMenu(item.dataset.relId, char.id));
  });

  el.querySelector('#cd-add-rel').addEventListener('click', () => openRelForm(null, char.id));
}

// ════════════════════════════════════════════
// RELATIONSHIP FORM
// ════════════════════════════════════════════

function openRelMenu(relId, charId) {
  const rel = getRelationship(relId);
  if (!rel) return;
  openModal({
    centered: true,
    content: `
      <div class="modal-dialog">
        <div class="modal-header" style="padding-bottom:4px;">
          <h3>${esc(rel.label)}</h3>
          <button class="icon-btn" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-footer" style="flex-direction:column;gap:8px;">
          <button class="btn btn-secondary" id="rel-edit" style="flex:none;width:100%;">✎ Edit Relationship</button>
          <button class="btn btn-danger" id="rel-delete" style="flex:none;width:100%;">🗑 Delete</button>
        </div>
      </div>
    `
  });

  document.getElementById('rel-edit').addEventListener('click', () => {
    closeModal();
    openRelForm(relId, charId);
  });

  document.getElementById('rel-delete').addEventListener('click', () => {
    closeModal();
    confirmDelete('Delete this relationship?', `"${rel.label}" will be removed.`, () => {
      deleteRelationship(relId);
      showToast('Relationship deleted.');
      renderCharDetail();
    });
  });
}

function relFormHTML(rel, charId) {
  const allChars = getCharacters(State.bookId).filter(c => c.id !== charId);
  const thisChar = getCharacter(charId);
  const selectedOtherId = rel ? (rel.fromCharacterId === charId ? rel.toCharacterId : rel.fromCharacterId) : null;
  const label = rel ? esc(rel.label) : '';
  const direction = rel ? rel.direction : 'one-way';
  const isFrom = rel ? rel.fromCharacterId === charId : true;

  const charItems = allChars.length === 0
    ? `<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:0.88rem;">No other characters in this book yet.</div>`
    : allChars.map(c => `
      <div class="char-picker-item${c.id === selectedOtherId ? ' selected' : ''}" data-id="${c.id}">
        <div class="color-dot" style="background:${c.colorTag}"></div>
        <span class="char-picker-name">${esc(c.name)}</span>
      </div>
    `).join('');

  const thisName = esc(thisChar.name);

  return `
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h3>${rel ? 'Edit Relationship' : 'Add Relationship'}</h3>
        <button class="icon-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Other Character *</label>
          <input class="char-picker-search" id="rel-search" placeholder="Search characters…" autocomplete="off">
          <div class="char-picker-list" id="rel-char-list">${charItems}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Relationship Label *</label>
          <input class="form-input" id="rel-label" value="${label}" placeholder="e.g. Brother, Mentor, Enemy…" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Direction</label>
          <div class="dir-toggle">
            <button class="dir-btn${direction === 'one-way' && isFrom ? ' active' : ''}" data-dir="one-way-from">${thisName} →</button>
            <button class="dir-btn${direction === 'one-way' && !isFrom ? ' active' : ''}" data-dir="one-way-to">→ ${thisName}</button>
            <button class="dir-btn${direction === 'mutual' ? ' active' : ''}" data-dir="mutual">↔ Mutual</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" id="rel-save" disabled>${rel ? 'Save Changes' : 'Add'}</button>
      </div>
    </div>
  `;
}

function openRelForm(relId, charId) {
  const rel = relId ? getRelationship(relId) : null;
  const bd = openModal({ content: relFormHTML(rel, charId) });

  let selectedOtherId = rel ? (rel.fromCharacterId === charId ? rel.toCharacterId : rel.fromCharacterId) : null;
  let selectedDir = rel ? rel.direction : 'one-way';
  let dirIsFrom = rel ? rel.fromCharacterId === charId : true;

  const labelIn = bd.querySelector('#rel-label');
  const saveBtn = bd.querySelector('#rel-save');
  const searchIn = bd.querySelector('#rel-search');
  const listEl = bd.querySelector('#rel-char-list');

  function checkValid() {
    saveBtn.disabled = !selectedOtherId || !labelIn.value.trim();
  }

  labelIn.addEventListener('input', checkValid);

  // Character picker selection
  listEl.addEventListener('click', e => {
    const item = e.target.closest('.char-picker-item');
    if (!item) return;
    listEl.querySelectorAll('.char-picker-item').forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    selectedOtherId = item.dataset.id;
    checkValid();
  });

  // Search filter
  searchIn.addEventListener('input', () => {
    const q = searchIn.value.toLowerCase();
    listEl.querySelectorAll('.char-picker-item').forEach(item => {
      const name = item.querySelector('.char-picker-name').textContent.toLowerCase();
      item.style.display = name.includes(q) ? '' : 'none';
    });
  });

  // Direction buttons
  bd.querySelectorAll('.dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      bd.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const d = btn.dataset.dir;
      if (d === 'mutual') { selectedDir = 'mutual'; dirIsFrom = true; }
      else if (d === 'one-way-from') { selectedDir = 'one-way'; dirIsFrom = true; }
      else { selectedDir = 'one-way'; dirIsFrom = false; }
    });
  });

  if (selectedOtherId) checkValid();

  saveBtn.addEventListener('click', () => {
    const label = labelIn.value.trim();
    if (!selectedOtherId || !label) return;
    const fromId = dirIsFrom ? charId : selectedOtherId;
    const toId = dirIsFrom ? selectedOtherId : charId;
    if (relId) {
      updateRelationship(relId, { fromCharacterId: fromId, toCharacterId: toId, label, direction: selectedDir });
      showToast('Relationship updated!');
    } else {
      createRelationship({ bookId: State.bookId, fromCharacterId: fromId, toCharacterId: toId, label, direction: selectedDir });
      showToast('Relationship added!');
    }
    closeModal();
    renderCharDetail();
  });
}

// ════════════════════════════════════════════
// CONFIRM DELETE
// ════════════════════════════════════════════

function confirmDelete(title, message, onConfirm) {
  openModal({
    centered: true,
    content: `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>${esc(title)}</h3>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-muted);font-size:0.9rem;line-height:1.55;">${esc(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-danger" id="confirm-del">Delete</button>
        </div>
      </div>
    `
  });
  document.getElementById('confirm-del').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

// ════════════════════════════════════════════
// CONTEXT MENUS
// ════════════════════════════════════════════

let _openCtxMenu = null;

function closeAllContextMenus() {
  if (_openCtxMenu && _openCtxMenu.parentNode) {
    _openCtxMenu.parentNode.removeChild(_openCtxMenu);
    _openCtxMenu = null;
  }
}

// ════════════════════════════════════════════
// MIND MAP
// ════════════════════════════════════════════

let _mm = null;

function initMindMap() {
  if (_mm && _mm.stopSim) _mm.stopSim();
  const container = document.getElementById('mindmap-container');
  const svg = document.getElementById('mindmap-svg');
  if (!container || !svg) return;

  const chars = getCharacters(State.bookId);
  const rels = getRelationships(State.bookId);

  // Empty state
  if (chars.length === 0) {
    svg.style.display = 'none';
    if (!container.querySelector('.empty-state')) {
      const es = document.createElement('div');
      es.className = 'empty-state';
      es.style.cssText = 'position:absolute;inset:0;';
      es.innerHTML = `
        <div class="empty-icon">🕸️</div>
        <div class="empty-title">No characters yet</div>
        <div class="empty-text">Go to the Characters tab to add some.</div>
      `;
      container.appendChild(es);
    }
    return;
  }

  svg.style.display = '';
  container.querySelectorAll('.empty-state').forEach(e => e.remove());

  const W = container.clientWidth || 360;
  const H = container.clientHeight || 500;

  // Initialize node positions in a circle, scaled for character count
  const cx = W / 2, cy = H / 2;
  // Minimum arc length between nodes ≈ 60px; spread more for larger casts
  const minRadius = Math.min(W, H) * 0.3;
  const arcRadius = (chars.length * 60) / (2 * Math.PI);
  const radius = Math.min(Math.max(minRadius, arcRadius), Math.min(W, H) * 0.45);

  const nodes = chars.map((c, i) => {
    const angle = (2 * Math.PI * i) / chars.length - Math.PI / 2;
    return {
      id: c.id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0, vy: 0,
      fixed: false,
      char: c,
    };
  });

  const edges = rels.map(r => ({ ...r }));
  _mm = { nodes, edges, transform: { x: 0, y: 0, scale: 1 }, rafId: null };

  // Build SVG
  buildMMSvg(svg, nodes, edges, W, H);

  // Run force simulation
  let alpha = 1;
  let simActive = true;
  _mm.stopSim = () => { simActive = false; };

  function simTick() {
    if (!simActive || alpha <= 0.001) return;
    forceStep(nodes, edges, W, H, alpha);
    alpha *= 0.96;
    updateMMPositions(svg, nodes);
    requestAnimationFrame(simTick);
  }

  requestAnimationFrame(simTick);

  // Touch/mouse interactions
  bindMMInteractions(svg, container, nodes, edges);
}

function buildMMSvg(svg, nodes, edges, W, H) {
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Single marker used for both start and end — auto-start-reverse flips it for start
  const defs = `<defs>
    <marker id="mm-arrow" markerWidth="10" markerHeight="7"
            refX="10" refY="3.5" orient="auto-start-reverse"
            markerUnits="userSpaceOnUse">
      <polygon points="0 0, 10 3.5, 0 7" fill="#888"/>
    </marker>
  </defs>`;

  const gRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gRoot.id = 'mm-root';
  svg.insertAdjacentHTML('afterbegin', defs);
  svg.appendChild(gRoot);

  // Create edges
  edges.forEach(e => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'mm-edge');
    g.dataset.relId = e.id;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', 'var(--border)');
    line.setAttribute('stroke-width', '1.8');
    if (e.direction === 'mutual') {
      line.setAttribute('marker-end', 'url(#mm-arrow)');
      line.setAttribute('marker-start', 'url(#mm-arrow)');
    } else {
      line.setAttribute('marker-end', 'url(#mm-arrow)');
    }

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'mm-edge-label');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dy', '-4');
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('font-size', '11');
    label.textContent = e.label;

    g.appendChild(line);
    g.appendChild(label);
    gRoot.appendChild(g);
  });

  // Create nodes
  nodes.forEach(n => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'mm-node');
    g.dataset.nodeId = n.id;
    g.setAttribute('transform', `translate(${n.x},${n.y})`);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '22');
    circle.setAttribute('fill', n.char.colorTag);
    circle.setAttribute('stroke', 'var(--surface)');
    circle.setAttribute('stroke-width', '3');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dy', '38');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-family', 'Georgia, serif');
    text.setAttribute('fill', 'var(--text)');
    text.textContent = n.char.name.length > 14 ? n.char.name.slice(0, 13) + '…' : n.char.name;

    g.appendChild(circle);
    g.appendChild(text);
    gRoot.appendChild(g);
  });

  updateMMPositions(svg, nodes);
}

function updateMMPositions(svg, nodes) {
  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  svg.querySelectorAll('.mm-node').forEach(g => {
    const n = nodeMap[g.dataset.nodeId];
    if (n) g.setAttribute('transform', `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
  });

  svg.querySelectorAll('.mm-edge').forEach(g => {
    const relId = g.dataset.relId;
    const edge = _mm ? _mm.edges.find(e => e.id === relId) : null;
    if (!edge) return;
    const from = nodeMap[edge.fromCharacterId];
    const to = nodeMap[edge.toCharacterId];
    if (!from || !to) return;

    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const r = 22;
    // Shorten line to node edge
    const x1 = from.x + (dx / dist) * r;
    const y1 = from.y + (dy / dist) * r;
    const x2 = to.x - (dx / dist) * r;
    const y2 = to.y - (dy / dist) * r;

    const line = g.querySelector('line');
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));

    const label = g.querySelector('text');
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    label.setAttribute('x', mx.toFixed(1));
    label.setAttribute('y', my.toFixed(1));
  });
}

function forceStep(nodes, edges, W, H, alpha) {
  const REPEL = 6000;
  const REST = 140;
  const SPRING = 0.04;
  const GRAVITY = 0.02;
  const cx = W / 2, cy = H / 2;

  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy || 0.01;
      const dist = Math.sqrt(dist2);
      const force = (REPEL / dist2) * alpha;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }

  // Spring attraction along edges
  edges.forEach(e => {
    const a = nodes.find(n => n.id === e.fromCharacterId);
    const b = nodes.find(n => n.id === e.toCharacterId);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - REST) * SPRING * alpha;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  });

  // Gravity toward center
  nodes.forEach(n => {
    n.vx += (cx - n.x) * GRAVITY * alpha;
    n.vy += (cy - n.y) * GRAVITY * alpha;
  });

  // Apply with damping and bounds
  const pad = 50;
  nodes.forEach(n => {
    if (n.fixed) return;
    n.vx *= 0.65;
    n.vy *= 0.65;
    n.x = Math.max(pad, Math.min(W - pad, n.x + n.vx));
    n.y = Math.max(pad, Math.min(H - pad, n.y + n.vy));
  });
}

function bindMMInteractions(svg, container, nodes, edges) {
  const gRoot = svg.querySelector('#mm-root');
  let pan = null;
  let pinch = null;
  let tx = 0, ty = 0, scale = 1;
  const MIN_SCALE = 0.3, MAX_SCALE = 4;

  function applyTransform() {
    gRoot.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
  }

  // Node drag state
  let draggingNode = null;
  let dragStart = null;
  let tapTime = 0;

  function svgPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - tx) / scale,
      y: (clientY - rect.top - ty) / scale,
    };
  }

  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const target = touch.target.closest('.mm-node');
      if (target) {
        const nodeId = target.dataset.nodeId;
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          draggingNode = node;
          dragStart = { x: touch.clientX, y: touch.clientY, nx: node.x, ny: node.y };
          tapTime = Date.now();
          node.fixed = true;
          if (_mm && _mm.rafId) { cancelAnimationFrame(_mm.rafId); _mm.rafId = null; }
          e.preventDefault();
        } else {
          pan = { x: touch.clientX - tx, y: touch.clientY - ty };
        }
      } else {
        pan = { x: touch.clientX - tx, y: touch.clientY - ty };
      }
    } else if (e.touches.length === 2) {
      draggingNode = null;
      pan = null;
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinch = { dist: Math.sqrt(dx * dx + dy * dy), scale, tx, ty };
      e.preventDefault();
    }
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    if (draggingNode && e.touches.length === 1) {
      const t = e.touches[0];
      const sp = svgPoint(t.clientX, t.clientY);
      const ds = svgPoint(dragStart.x, dragStart.y);
      draggingNode.x = dragStart.nx + (sp.x - ds.x);
      draggingNode.y = dragStart.ny + (sp.y - ds.y);
      draggingNode.vx = 0; draggingNode.vy = 0;
      updateMMPositions(svg, nodes);
      e.preventDefault();
    } else if (pan && e.touches.length === 1) {
      tx = e.touches[0].clientX - pan.x;
      ty = e.touches[0].clientY - pan.y;
      applyTransform();
      e.preventDefault();
    } else if (pinch && e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const ratio = newDist / pinch.dist;
      scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.scale * ratio));
      applyTransform();
      e.preventDefault();
    }
  }, { passive: false });

  svg.addEventListener('touchend', e => {
    if (draggingNode) {
      const elapsed = Date.now() - tapTime;
      if (elapsed < 250 && dragStart) {
        const dx = e.changedTouches[0].clientX - dragStart.x;
        const dy = e.changedTouches[0].clientY - dragStart.y;
        if (Math.sqrt(dx * dx + dy * dy) < 8) {
          navigate('char-detail', { charId: draggingNode.id });
        }
      }
      draggingNode.fixed = false;
      draggingNode = null;
      dragStart = null;
    }
    pan = null;
    if (e.touches.length < 2) pinch = null;
  }, { passive: true });

  // Mouse support (desktop testing)
  let mouseDragNode = null, mouseStartPos = null, mouseTapTime = 0;
  let mousePan = null;

  svg.addEventListener('mousedown', e => {
    const target = e.target.closest('.mm-node');
    if (target) {
      const node = nodes.find(n => n.id === target.dataset.nodeId);
      if (node) {
        mouseDragNode = node;
        mouseStartPos = { x: e.clientX, y: e.clientY, nx: node.x, ny: node.y };
        mouseTapTime = Date.now();
        node.fixed = true;
        if (_mm && _mm.stopSim) _mm.stopSim();
      }
    } else {
      mousePan = { x: e.clientX - tx, y: e.clientY - ty };
    }
  });

  window.addEventListener('mousemove', e => {
    if (mouseDragNode) {
      const sp = svgPoint(e.clientX, e.clientY);
      const ds = svgPoint(mouseStartPos.x, mouseStartPos.y);
      mouseDragNode.x = mouseStartPos.nx + (sp.x - ds.x);
      mouseDragNode.y = mouseStartPos.ny + (sp.y - ds.y);
      mouseDragNode.vx = 0; mouseDragNode.vy = 0;
      updateMMPositions(svg, nodes);
    } else if (mousePan) {
      tx = e.clientX - mousePan.x;
      ty = e.clientY - mousePan.y;
      applyTransform();
    }
  });

  window.addEventListener('mouseup', e => {
    if (mouseDragNode) {
      const elapsed = Date.now() - mouseTapTime;
      if (elapsed < 250 && mouseStartPos) {
        const dx = e.clientX - mouseStartPos.x;
        const dy = e.clientY - mouseStartPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < 6) {
          navigate('char-detail', { charId: mouseDragNode.id });
        }
      }
      mouseDragNode.fixed = false;
      mouseDragNode = null;
    }
    mousePan = null;
  });

  // Wheel zoom
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    applyTransform();
  }, { passive: false });
}

// ════════════════════════════════════════════
// FILE IMPORT HANDLERS
// ════════════════════════════════════════════

document.getElementById('file-import-book').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      importBook(json);
      showToast('Book imported!');
      renderBookshelf();
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

document.getElementById('file-import-char').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const json = JSON.parse(ev.target.result);
      importCharacter(State.bookId, json);
      showToast('Character imported!');
      renderCharList();
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════

(async function init() {
  applyTheme(getTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'auto') updateThemeButtons();
  });

  // Show a brief loading screen while we fetch data from the server
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:var(--bg)', 'z-index:999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'flex-direction:column', 'gap:12px',
    'font-family:Georgia,serif', 'color:var(--text-muted)',
  ].join(';');
  overlay.innerHTML = `<div style="font-size:2.5rem">📖</div><div style="font-size:1rem">Loading…</div>`;
  document.body.appendChild(overlay);

  const loaded = await _loadFromServer();
  if (!loaded) {
    // Server not running — seed cache from localStorage so the app still works
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const s   = raw ? JSON.parse(raw) : null;
      _storeCache = (s && s.books) ? s : emptyStore();
    } catch { _storeCache = emptyStore(); }
  }

  overlay.remove();
  navigate('bookshelf');
})();
