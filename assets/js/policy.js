/* =========================================================================
   Originate Command · Policy
   The workspace's standing rules, kept on their own page so they are not
   scrolled past on the Notice Board.
   ========================================================================= */

window.OC = window.OC || {};

OC.policy = (function () {
  function me() {
    return OC.store.user(OC.store.session()) || (OC.store.state && OC.store.state.users && OC.store.state.users[0]) || { id: '', name: 'User', admin: false };
  }

  function render(host) {
    var h = OC.ui.h;
    var user = me();

    OC.ui.clear(host);
    OC.ui.append(host, [
      h('div', { class: 'page-head' }, [
        h('h1', {}, 'Policy'),
        h('p', {}, 'Standing rules and company policies for the team. You are seeing this as ' +
          user.name + ' (' + OC.can.roleLabel(user) + ').')
      ]),
      h('div', { class: 'empty' }, [OC.icon('file'), 'No policies have been added yet.'])
    ]);
  }

  return { render: render };
})();
