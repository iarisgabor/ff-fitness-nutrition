(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Split-flap scoreboard: cycle digits up to the target, then settle. ---
  function animateFlap(flap) {
    var target = flap.getAttribute('data-target');
    var display = flap.querySelector('span');
    if (prefersReducedMotion) {
      display.textContent = target;
      return;
    }
    var targetNum = parseInt(target, 10);
    var current = 0;
    var delay = 90;

    function step() {
      display.textContent = String(current);
      if (current >= targetNum) return;
      current += 1;
      setTimeout(step, delay);
    }
    step();
  }

  function runScoreboard() {
    var flaps = document.querySelectorAll('#flapScore .flap');
    flaps.forEach(function (flap, i) {
      setTimeout(function () { animateFlap(flap); }, i * 250);
    });
  }

  if ('IntersectionObserver' in window) {
    var scoreboard = document.getElementById('flapScore');
    if (scoreboard) {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            runScoreboard();
            obs.disconnect();
          }
        });
      }, { threshold: 0.6 });
      io.observe(scoreboard);
    }
  } else {
    runScoreboard();
  }

  // --- Setlist: decade filter ---
  var chips = document.querySelectorAll('.chip');
  var tracks = document.querySelectorAll('.track');

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
      chip.setAttribute('aria-pressed', 'true');
      var decade = chip.getAttribute('data-decade');
      tracks.forEach(function (track) {
        var show = decade === 'all' || track.getAttribute('data-decade') === decade;
        track.style.display = show ? '' : 'none';
      });
    });
  });

  // --- Setlist: expand a track's fun fact ---
  document.querySelectorAll('.track__toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var track = btn.closest('.track');
      var open = track.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? '–' : '+';
    });
  });
})();
