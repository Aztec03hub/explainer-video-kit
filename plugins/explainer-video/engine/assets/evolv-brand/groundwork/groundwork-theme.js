// groundwork theme switch (groundwork section 11): system | light | dark. The default is Dark.
// Load it in <head> before first paint: <script src="groundwork/groundwork-theme.js"></script>
// Nothing stored, a bad value or blocked storage gives Dark. Dark and Light set data-theme on <html>; System
// removes it, so groundwork.css follows the OS. The choice is saved under "gw-theme" (System too, because
// "nothing stored" means Dark). Every storage access is in try/catch, so a blocked store still renders Dark and
// the switch still works for the visit. Any element with data-gw-theme="system|light|dark" becomes a button.
// From a framework's own switch, call groundworkTheme.set(mode). No build step, no dependencies.
(function () {
  var KEY = 'gw-theme';
  var DEFAULT = 'dark';
  var root = document.documentElement;

  function parse(v) {
    return v === 'light' || v === 'dark' || v === 'system' ? v : DEFAULT;
  }

  function read() {
    try {
      return parse(localStorage.getItem(KEY)); // reading localStorage itself can throw
    } catch (e) {
      return DEFAULT;
    }
  }

  var current = read(); // kept in memory, so get() stays right for the visit when storage is blocked

  function get() {
    return current;
  }

  function apply(mode) {
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
  }

  function mark(mode) {
    var els = document.querySelectorAll('[data-gw-theme]');
    for (var i = 0; i < els.length; i++) {
      els[i].setAttribute('aria-pressed', String(els[i].getAttribute('data-gw-theme') === mode));
    }
  }

  function set(mode) {
    mode = parse(mode);
    current = mode;
    apply(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch (e) {
      /* storage blocked: the choice still applies for this visit */
    }
    mark(mode);
  }

  // One listener on document, so buttons a framework renders later work too. Their aria-pressed is set at the
  // next set(); render them with aria-pressed from get() if they must be right at once.
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-gw-theme]');
    if (el) set(el.getAttribute('data-gw-theme'));
  });

  apply(current);
  window.groundworkTheme = { get: get, set: set };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mark(current); });
  else mark(current);
})();
