// theme-init.js - runs before the page paints so dark mode never flashes white.
// Kept as its own file (not inline) because the CSP only allows scripts from this server.
(function () {
  var theme = null;
  try { theme = localStorage.getItem("hf-theme"); } catch (e) { /* storage blocked: follow the device */ }
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
})();
