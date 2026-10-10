// Background Service Worker for Roblox Auto Permission Extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Roblox AutoPerm] Extension Installed successfully.');
  
  // Set default settings if not already present
  chrome.storage.local.get(['usernames', 'universeId'], (data) => {
    if (!data.usernames) {
      chrome.storage.local.set({ usernames: [] });
    }
    if (data.universeId === undefined) {
      chrome.storage.local.set({ universeId: '' });
    }
  });
});

// Update extension icon badge when auto status changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.rbx_auto_active) {
    const isActive = changes.rbx_auto_active.newValue;
    if (isActive) {
      chrome.action.setBadgeText({ text: 'RUN' });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald green
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
});
