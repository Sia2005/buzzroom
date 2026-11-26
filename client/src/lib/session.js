const KEYS = {
  player: 'buzzroom:player-session',
  host: 'buzzroom:host-session',
  draft: 'buzzroom:quiz-draft',
};

function read(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function remove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    return;
  }
}

export const loadSession = (role) => read(localStorage, KEYS[role]);
export const saveSession = (role, session) => write(localStorage, KEYS[role], session);
export const clearSession = (role) => remove(localStorage, KEYS[role]);

export const loadDraft = () => read(sessionStorage, KEYS.draft);
export const saveDraft = (draft) => write(sessionStorage, KEYS.draft, draft);
export const clearDraft = () => remove(sessionStorage, KEYS.draft);
