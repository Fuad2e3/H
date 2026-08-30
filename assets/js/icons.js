/* =========================================================================
   icons.js — inline SVG icons
   A small stroked set drawn on a 16px grid, inherited from currentColor so
   every icon takes the colour of the control it sits in. Inline rather than
   a font or a sprite sheet: no extra request, no dependency, and they stay
   crisp in both themes.
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.icon = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var PATHS = {
    bell:      ['M8 2.5a4 4 0 0 1 4 4v3l1.2 2.2H2.8L4 9.5v-3a4 4 0 0 1 4-4Z', 'M6.4 13.5a1.7 1.7 0 0 0 3.2 0'],
    plus:      ['M8 3.5v9', 'M3.5 8h9'],
    search:    ['M7.2 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6Z', 'M10.8 10.8 13.5 13.5'],
    check:     ['M3 8.4 6.3 11.6 13 4.9'],
    alert:     ['M8 2.8 14 13H2l6-10.2Z', 'M8 6.6v3', 'M8 11.3h.01'],
    close:     ['M4 4l8 8', 'M12 4l-8 8'],
    inbox:     ['M2.5 9.5h3l1 2h3l1-2h3', 'M4 3h8l2 6.5v3.5H2V9.5L4 3Z'],
    filter:    ['M2.5 4h11', 'M4.5 8h7', 'M6.5 12h3'],
    users:     ['M6 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z', 'M2 13c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5', 'M11 4.2a2 2 0 0 1 0 3.8', 'M12 9.8c1.3.4 2 1.5 2 3.2'],
    monitor:   ['M2.5 3.5h11v7h-11z', 'M6 13h4', 'M8 10.5V13'],
    moon:      ['M12.5 9.4A5 5 0 0 1 6.6 3.5a5 5 0 1 0 5.9 5.9Z'],
    sun:       ['M8 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z', 'M8 1.6v1.3', 'M8 13.1v1.3', 'M1.6 8h1.3', 'M13.1 8h1.3', 'M3.5 3.5l.9.9', 'M11.6 11.6l.9.9', 'M12.5 3.5l-.9.9', 'M4.4 11.6l-.9.9'],
    board:     ['M2.5 3h11v10h-11z', 'M8 3v10'],
    reset:     ['M13 8a5 5 0 1 1-1.6-3.7', 'M13.2 2.6v3.2H10'],
    logout:    ['M6 13.5H3.5A1.5 1.5 0 0 1 2 12V4a1.5 1.5 0 0 1 1.5-1.5H6', 'M10.5 11l3-3-3-3', 'M5.5 8h8']
  };

  function icon(name, extraClass) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    (PATHS[name] || []).forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  icon.names = Object.keys(PATHS);
  return icon;
})();
