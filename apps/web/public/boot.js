// Paints the chosen background before the app loads, so Light users don't see a black flash.
// A separate file (not inline) because the server's Content-Security-Policy blocks inline scripts.
try {
  var a = JSON.parse(localStorage.getItem('ow.appearance') || '{}');
  var light = a.mode === 'light' || (a.mode === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  var dark = a.mode === 'dark' || (a.mode === 'system' && !light);
  if (light || dark) document.documentElement.style.background = light ? '#f3f3f6' : '#0f1013';
} catch (e) {}
