/* BikefitSim motion: sections slam in as they scroll into view, a light follows the pointer, result numbers bump when they change,
   a speed bar tracks the scroll and the hero runs a lap timer.
   Purely cosmetic. Nothing here touches the data, and the page works the same if this file fails. */
(function () {
  'use strict';
  var body = document.body;
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('.sheet, .credits');

  // riders on the velodrome and the pedalling legs are SVG animations: stop them when the system asks for less motion
  if (still) document.querySelectorAll('.top svg').forEach(function (svg) { if (svg.pauseAnimations) svg.pauseAnimations(); });

  var bar = document.getElementById('speedBar');
  if (bar) {
    var onScroll = function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty('--p', h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)).toFixed(4) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  var lapN = document.getElementById('lapN'), lapT = document.getElementById('lapT');
  if (lapN && lapT && !still) {
    var LAP = 14.2, t0 = performance.now(), shown = '';
    (function tick(now) {
      var t = (now - t0) / 1000, n = Math.floor(t / LAP) + 1, s = (t % LAP).toFixed(3);
      if (s.length < 6) s = '0' + s;
      if (s !== shown) { lapT.textContent = s; shown = s; }
      if (lapN.textContent !== String(n)) lapN.textContent = n;
      requestAnimationFrame(tick);
    })(t0);
  }

  if (!still && 'IntersectionObserver' in window) {
    body.classList.add('fx');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    targets.forEach(function (el, i) { el.style.transitionDelay = Math.min(i, 3) * 40 + 'ms'; io.observe(el); });
    // never leave a section hidden
    setTimeout(function () { targets.forEach(function (el) { el.classList.add('in'); }); }, 1800);
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
