export const storage = {
  async getItem(key) {
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    localStorage.setItem(key, String(value));
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  },
  clear() {
    localStorage.clear();
  }
};

/**
 * @description Checks if the user already seems to have existing data from previous use.
 */
export function checkForExistingData() {
  return Boolean(localStorage.getItem('token') || localStorage.getItem('accessToken'));
}
