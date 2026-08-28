/* =========================================================================
   contents.js — contents rail position marker
   Marks the section currently in view with aria-current on its rail link,
   so the reader can see where they are in a long specification. Degrades
   to a plain anchor list where IntersectionObserver is unavailable.
   Originate Command · OM SRS 001
   ========================================================================= */

(function () {
  'use strict';

  if (!window.IntersectionObserver) return;

  var links = {};
  var railLinks = document.querySelectorAll('.index-rail a');
  var sections = document.querySelectorAll('section.sec');
  if (!railLinks.length || !sections.length) return;

  Array.prototype.forEach.call(railLinks, function (link) {
    links[link.getAttribute('href').slice(1)] = link;
  });

  var current = null;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var link = links[entry.target.id];
      if (!link || link === current) return;
      if (current) current.removeAttribute('aria-current');
      link.setAttribute('aria-current', 'true');
      current = link;
    });
  }, { rootMargin: '-10% 0px -70% 0px', threshold: 0 });

  Array.prototype.forEach.call(sections, function (section) {
    observer.observe(section);
  });
})();
