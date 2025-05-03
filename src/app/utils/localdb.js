const STORAGE_KEY = 'phpsessid_list';

export function getStoredSessions() {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('读取存储的会话失败:', error);
    return [];
  }
}

export function addSession(sessionId, description = '') {
  try {
    const sessions = getStoredSessions();
    const timestamp = new Date().toISOString();
    
    // 检查是否已存在
    const existingIndex = sessions.findIndex(s => s.id === sessionId);
    if (existingIndex >= 0) {
      sessions[existingIndex] = {
        ...sessions[existingIndex],
        description: description || sessions[existingIndex].description,
        lastChecked: timestamp
      };
    } else {
      sessions.push({
        id: sessionId,
        description,
        addedAt: timestamp,
        lastChecked: timestamp,
        isValid: null
      });
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    return true;
  } catch (error) {
    console.error('添加会话失败:', error);
    return false;
  }
}

export function removeSession(sessionId) {
  try {
    const sessions = getStoredSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('删除会话失败:', error);
    return false;
  }
}

export function updateSessionStatus(sessionId, isValid) {
  try {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.isValid = isValid;
      session.lastChecked = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      return true;
    }
    return false;
  } catch (error) {
    console.error('更新会话状态失败:', error);
    return false;
  }
}

export function updateSessionDescription(sessionId, description) {
  try {
    const sessions = getStoredSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.description = description;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      return true;
    }
    return false;
  } catch (error) {
    console.error('更新会话描述失败:', error);
    return false;
  }
} 