/* BikefitSim motion: sections rise in as they scroll into view, a soft light follows the pointer, and result numbers bump when they change.
   Purely cosmetic. Nothing here touches the data, and the page works the same if this file fails. */
(function () {
  'use strict';
  var body = document.body;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('.sheet, .credits');

  if (!still && 'IntersectionObserver' in window) {
    body.classList.add('fx');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    targets.forEach(function (el, i) { el.style.transitionDelay = Math.min(i, 3) * 60 + 'ms'; io.observe(el); });
    // never leave a section hidden
    setTimeout(function () { targets.forEach(function (el) { el.classList.add('in'); }); }, 2500);
  }

  document.querySelectorAll('.sheet').forEach(function (el) {
    el.addEventListener('pointermove', function (ev) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
      el.style.setProperty('--my', (ev.clientY - r.top) + 'px');
    }, { passive: true });
  });

  if (still || !('MutationObserver' in window)) return;
  var seen = new Map();
  var queued = false;
  function scan() {
    queued = false;
    document.querySelectorAll('.t-v').forEach(function (el) {
      var key = (el.closest('.tile') && el.closest('.tile').querySelector('.t-l') || {}).textContent || '';
      var now = el.textContent;
      if (seen.has(key) && seen.get(key) !== now) {
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      }
      seen.set(key, now);
    });
  }
  var mo = new MutationObserver(function () { if (!queued) { queued = true; requestAnimationFrame(scan); } });
  ['bikeOut', 'cmp'].forEach(function (id) {
    var n = document.getElementById(id);
    if (n) mo.observe(n, { childList: true, subtree: true, characterData: true });
  });
  scan();
})();
