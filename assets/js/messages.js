/* =========================================================================
   Originate Command · Messages
   Channels and direct messages, in their own section rather than inside
   Management. Management is the system admin's, but writing to a colleague is
   everybody's, so the chat needs a door that does not go through it.
   ========================================================================= */

window.OC = window.OC || {};

OC.messages = (function () {
  'use strict';

  function render(host, rerender) {
    if (!OC.groups || !OC.groups.render) return;
    /* the third argument hides the Management heading the chat draws when it
       is a tab inside that page */
    OC.groups.render(host, rerender, true);
  }

  return { render: render };
})();
