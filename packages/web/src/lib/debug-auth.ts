// Monkey-patch localStorage to catch who clears auth tokens
const origRemoveItem = localStorage.removeItem.bind(localStorage);
localStorage.removeItem = function(key: string) {
  if (key.includes("verso")) {
    console.error(`[AUTH DEBUG] localStorage.removeItem("${key}") called from:`, new Error().stack);
  }
  return origRemoveItem(key);
};

const origSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(key: string, value: string) {
  if (key.includes("verso-access") || key.includes("verso-refresh")) {
    console.log(`[AUTH DEBUG] localStorage.setItem("${key}") — token set`);
  }
  return origSetItem(key, value);
};
