// Freemium gate — tracks daily free analysis usage
// Used by content scripts (via chrome.runtime.sendMessage to service worker)

const TF_FREEMIUM = {
  async getStatus() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: TF_CONSTANTS.MSG.GET_STATUS }, resolve);
    });
  },
};
