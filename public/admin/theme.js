// Runs before the page is drawn, so the theme never flashes the wrong colours.
// Dark is the default until someone picks a theme on this device.
(function setUpTheme() {
  const KEY = 'safe-view-theme';
  const apply = (theme) => { document.documentElement.dataset.theme = theme; };
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* Private windows can block saved choices. */ }
  apply(saved === 'light' ? 'light' : 'dark');
  window.setTheme = (theme) => {
    apply(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* The choice lasts until the page closes. */ }
  };
}());
