// Runs before the page is drawn, so a dark theme never flashes white.
// Follows the phone or computer setting until someone picks a theme.
(function setUpTheme() {
  const KEY = 'safe-view-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const read = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  const apply = (theme) => { document.documentElement.dataset.theme = theme; };
  const saved = read();
  apply(saved === 'dark' || saved === 'light' ? saved : (system.matches ? 'dark' : 'light'));
  system.addEventListener('change', (event) => {
    if (!read()) apply(event.matches ? 'dark' : 'light');
  });
  window.toggleTheme = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* The choice lasts until the page closes. */ }
  };
}());
