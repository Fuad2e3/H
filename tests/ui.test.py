"""UI suite — the interface, driven through a real browser against the server.

Every permission check here is about what the interface offers. What the
server will actually do is covered by server/tests/api.test.js, and the two
should agree: a person should not be shown a button the server would refuse.

Start the server first:  npm start
Then from the project root: npm run test:ui
Set CHROME_PATH if Chromium lives somewhere else.
Originate Command · OM SRS 001
"""
import os, sys, pathlib, socket, subprocess, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

CHROME = os.environ.get('CHROME_PATH', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
SCR = str(pathlib.Path('tests/.screenshots').resolve()) + '/'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def start_server():
    """Own server, own database, own port.

    An earlier version of this suite reused whatever was already listening on
    3000. When a previous server was still up, the new one failed to bind and
    the old one kept answering from a database that had since been deleted —
    which looked exactly like the application duplicating everything it wrote.
    """
    db = pathlib.Path(tempfile.mkdtemp()) / 'ui-test.db'
    env = dict(os.environ, OC_DB=str(db))
    subprocess.run(['node', 'server/src/seed.js'], env=env, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    port = free_port()
    proc = subprocess.Popen(['node', 'server/src/index.js'],
                            env=dict(env, PORT=str(port)),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    base = f'http://127.0.0.1:{port}/'
    for _ in range(50):
        try:
            urllib.request.urlopen(base, timeout=1)
            return proc, base
        except Exception:
            time.sleep(0.2)
    proc.kill()
    raise SystemExit('the server did not come up')


SERVER, URL = start_server()

passed = 0
fails = []

def ok(label, got, want=True):
    global passed
    if got == want:
        passed += 1
        print('  PASS ' + label)
    else:
        fails.append(label)
        print(f'  FAIL {label}   got={got!r} want={want!r}')

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    # refusals are the point of several checks below, so a 4xx logged by the
    # browser is expected here; a page error never is
    EXPECTED = ('fonts.g', 'ERR_CONNECTION_RESET', '401', '403', '409', '400')
    page.on('console', lambda m: errs.append(m.type + ': ' + m.text)
            if m.type == 'error' and not any(x in m.text for x in EXPECTED) else None)

    def sign_in(email, password='originate'):
        page.locator('.signin-card input[type=text]').fill(email)
        page.locator('.signin-card input[type=password]').fill(password)
        page.locator('.signin-card button[type=submit]').click()
        page.wait_for_timeout(2200)

    def sign_out():
        page.locator('.iconbtn:has-text("Sign out")').click()
        page.wait_for_timeout(1500)

    def as_user(email):
        if page.locator('.topbar').count():
            sign_out()
        sign_in(email)

    def nav(name):
        page.get_by_role('button', name=name, exact=True).click()
        page.wait_for_timeout(450)

    def ds(i):
        return page.locator('dialog select').nth(i)

    def dtxt(i):
        return page.locator('dialog input[type=text]').nth(i)

    page.goto(URL, wait_until='domcontentloaded')
    page.wait_for_timeout(1500)

    print('\n=== signing in (6.1) ===')
    ok('the sign-in screen is what loads', page.locator('.signin-card').count(), 1)
    ok('no board before signing in', page.locator('.panel--todos').count(), 0)
    ok('it is a real form, so password managers work', page.locator('form.signin-card').count(), 1)
    sign_in('rifat@originate.example', 'wrong-password')
    ok('a wrong password is refused', 'do not match' in page.locator('.signin-card .error').inner_text())
    sign_in('nobody@originate.example')
    ok('an unknown address gets the same answer, so accounts cannot be discovered',
       'do not match' in page.locator('.signin-card .error').inner_text())

    print('\n=== a team member: scoped by the server (3.1) ===')
    sign_in('rifat@originate.example')
    ok('the interface starts', page.locator('.topbar').count(), 1)
    ok('the signed-in person is named', 'Rifat' in page.locator('.who').inner_text())
    ok('with their role', 'Member' in page.locator('.who').inner_text())
    member = page.evaluate('({todos: OC.store.state.todos.length, notes: OC.store.state.instructions.length,'
                           ' audit: OC.store.state.audit.length})')
    print('   member receives:', member)
    ok('the audit log never reaches a member (8.2)', member['audit'], 0)
    ok('no password hash is anywhere in what arrived',
       page.evaluate("JSON.stringify(OC.store.state).indexOf('scrypt$') === -1"))

    print('\n=== 3.2 the interface offers only what the server would allow ===')
    nav('Board')
    page.get_by_role('button', name='New todo', exact=True).first.click()
    page.wait_for_timeout(500)
    ok('a member is offered only themselves as assignee', ds(2).locator('option').all_inner_texts(),
       ['Rifat Chowdhury'])
    dtxt(0).fill('Test todo from the suite')
    page.click('dialog button:has-text("Create todo")')
    page.wait_for_timeout(400)
    ok('the server refuses a todo with no client (5.2)',
       'client' in page.locator('dialog .error').inner_text().lower())
    ds(0).select_option(label='Chaim')
    page.click('dialog button:has-text("Create todo")')
    page.wait_for_timeout(400)
    ok('and with no department (5.2)',
       'department' in page.locator('dialog .error').inner_text().lower())
    ds(1).select_option(label='Outreach Operations')
    page.click('dialog button:has-text("Create todo")')
    page.wait_for_timeout(1800)
    ok('with both, it is created', page.locator('.item:has-text("Test todo from the suite")').count(), 1)
    ok('a member is shown no Reassign button (6.2)',
       page.locator('.panel--todos button:has-text("Reassign")').count(), 0)
    ok('but can still change state', page.locator('.panel--todos .item select').count() > 0)

    print('\n=== it is really in the database ===')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_timeout(2200)
    nav('Board')
    ok('the todo survives a reload', page.locator('.item:has-text("Test todo from the suite")').count(), 1)
    ok('and so does the session', page.locator('.topbar').count(), 1)

    print('\n=== 6.2 blocked demands a reason ===')
    row = page.locator('.panel--todos .item:has-text("Test todo from the suite")').first
    row.locator('select').select_option('blocked')
    page.wait_for_timeout(500)
    page.click('dialog button:has-text("Mark blocked")')
    page.wait_for_timeout(400)
    ok('an empty reason is refused', 'reason' in page.locator('dialog .error').inner_text().lower())
    # a reason the seeded workspace does not already contain
    page.locator('dialog input[type=text]').first.fill('Suite blocked this one')
    page.click('dialog button:has-text("Mark blocked")')
    page.wait_for_timeout(1800)
    ok('the reason shows on the card',
       page.locator('.blocked-note:has-text("Suite blocked this one")').count(), 1)

    print('\n=== 6.3 anyone may post an instruction ===')
    page.get_by_role('button', name='Post instruction', exact=True).first.click()
    page.wait_for_timeout(500)
    page.locator('dialog textarea').fill('Posted by a team member, which 6.3 allows on purpose.')
    ds(0).select_option(label='Chaim')
    ds(1).select_option(label='Outreach Operations')
    page.locator('dialog .tagfield input[type=text]').last.fill('Suite Tag')
    page.click('dialog button:has-text("Post instruction")')
    page.wait_for_timeout(2000)
    ok('it is posted', page.locator('.note:has-text("Posted by a team member")').count(), 1)
    ok('the tag typed inline was created (6.4)',
       page.locator('.note:has-text("Posted by a team member") .chip:has-text("Suite Tag")').count(), 1)

    print('\n=== 5.0 comments ===')
    thread = page.locator('.panel--todos .item .thread').first
    thread.locator('summary').click()
    page.wait_for_timeout(300)
    thread.locator('input[type=text]').fill('Checked with the client this morning.')
    thread.locator('button:has-text("Post")').click()
    page.wait_for_timeout(1800)
    ok('a comment is saved and counted',
       page.locator('.panel--todos .item .thread summary', has_text='1 comment').count() > 0)

    print('\n=== 6.4 filters drive both panels ===')
    page.locator('.filters select').first.select_option(label='Chaim')
    page.wait_for_timeout(600)
    ok('todos are filtered', set(page.locator('.panel--todos .item .chip.client').all_inner_texts()), {'Chaim'})
    ok('instructions too', set(page.locator('.panel--instructions .note .chip.client').all_inner_texts()), {'Chaim'})

    print('\n=== 6.4 the client timeline ===')
    page.locator('.boardbar .segmented button', has_text='Client timeline').click()
    page.wait_for_timeout(700)
    ok('it names the client', page.locator('.panel--timeline h2').inner_text(), 'Chaim timeline')
    ok('and merges both kinds', sorted(set(page.locator('.tl-kind').all_inner_texts())),
       ['INSTRUCTION', 'TODO'])
    page.locator('.boardbar .segmented button', has_text='Two panels').click()
    page.wait_for_timeout(400)
    page.click('.filterbar-head button:has-text("Clear")')
    page.wait_for_timeout(500)

    print('\n=== 6.4 pinned filters reach the dashboard ===')
    page.locator('.filters select').first.select_option(label='Rafa')
    page.wait_for_timeout(500)
    page.click('.filterbar-head button:has-text("Pin filter")')
    page.wait_for_timeout(400)
    dtxt(0).fill('Everything Rafa')
    page.click('dialog button:has-text("Pin")')
    page.wait_for_timeout(1500)
    ok('the pin appears on the board', page.locator('.savedbar .chip:has-text("Everything Rafa")').count(), 1)
    nav('Dashboard')
    ok('and on the dashboard', page.locator('.card:has-text("Pinned filters") button:has-text("Everything Rafa")').count(), 1)

    print('\n=== the other roles ===')
    as_user('tanvir@originate.example')
    nav('Board')
    ok('a lead is shown Reassign', page.locator('.panel--todos button:has-text("Reassign")').count() > 0)
    nav('Groups')
    ok('a lead may not create a group (4.2)', page.locator('button:has-text("New group")').count(), 0)

    as_user('nadia@originate.example')
    nav('Groups')
    ok('a department head may', page.locator('button:has-text("New group")').count(), 1)
    nav('People')
    ok('and may invite (6.1)', page.locator('button:has-text("Invite someone")').count(), 1)
    ok('but is shown no department controls (4.1)', page.locator('button:has-text("New department")').count(), 0)

    as_user('shohag@originate.example')
    admin = page.evaluate('({todos: OC.store.state.todos.length, audit: OC.store.state.audit.length})')
    print('   admin receives:', admin)
    ok('the admin receives more than the member', admin['todos'] > member['todos'])
    ok('and the audit log', admin['audit'] > 0)
    nav('People')
    ok('the admin is shown department controls', page.locator('button:has-text("New department")').count(), 1)

    print('\n=== 3.4 / 4.1 departments are data ===')
    page.click('button:has-text("New department")')
    page.wait_for_timeout(500)
    dtxt(0).fill('Paid Advertising')
    page.locator('dialog input[type=text]').nth(1).fill('head, lead, buyer, analyst')
    page.click('dialog button:has-text("Create department")')
    page.wait_for_timeout(1800)
    ok('a seventh department, with no code change',
       page.locator('.grid-2 .card h3:has-text("Paid Advertising")').count(), 1)
    ok('carrying its own hierarchy',
       page.locator('.card:has-text("Paid Advertising") .chip:has-text("3. buyer")').count(), 1)
    page.locator('.card:has-text("Outreach Operations") button:has-text("Edit hierarchy")').click()
    page.wait_for_timeout(500)
    page.locator('dialog input[type=text]').first.fill('head, lead, member')
    page.click('dialog button:has-text("Save hierarchy")')
    page.wait_for_timeout(1200)
    ok('the server refuses to strip a level people still hold',
       page.locator('.toast.warn').count() > 0 or 'Mim' in page.locator('dialog .error').inner_text())
    page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>{d.close();d.remove();})")
    page.wait_for_timeout(400)

    print('\n=== 6.1 the invite lifecycle ===')
    nav('People')
    page.click('button:has-text("Invite someone")')
    page.wait_for_timeout(500)
    dtxt(0).fill('Invite Test')
    dtxt(1).fill('not-an-email')
    page.click('dialog button:has-text("Send invite")')
    page.wait_for_timeout(400)
    ok('the email address is validated', 'email' in page.locator('dialog .error').inner_text().lower())
    dtxt(1).fill('invite.test@originate.example')
    ok('the starting level defaults to the narrowest (8.2)', ds(1).input_value(), 'member')
    page.click('dialog button:has-text("Send invite")')
    page.wait_for_timeout(1800)
    ok('the pending invite is listed', page.locator('.invite-card:has-text("Invite Test")').count(), 1)
    ok('with a single-use token', 'Token inv-' in page.locator('.invite-card:has-text("Invite Test")').inner_text())
    hours = page.evaluate("""() => {
      const u = OC.store.state.users.find(x => x.name === 'Invite Test');
      return Math.round((new Date(u.invite.expires_at) - new Date(u.invite.issued_at)) / 3600000);
    }""")
    ok('expiring in 72 hours', hours, 72)
    first = page.evaluate("OC.store.state.users.find(x => x.name === 'Invite Test').invite.token")
    page.locator('.invite-card:has-text("Invite Test") button:has-text("Resend")').click()
    page.wait_for_timeout(1800)
    ok('resending invalidates the previous link',
       page.evaluate("OC.store.state.users.find(x => x.name === 'Invite Test').invite.token") != first)
    page.locator('.invite-card:has-text("Invite Test") button:has-text("Revoke")').click()
    page.wait_for_timeout(400)
    page.click('dialog button:has-text("Confirm")')
    page.wait_for_timeout(1800)
    ok('revoking removes the unclaimed account',
       page.evaluate("OC.store.state.users.some(x => x.name === 'Invite Test')"), False)

    print('\n=== 6.8 reporting ===')
    nav('Reports')
    figures = page.locator('.stat .v').all_inner_texts()
    ok('five snapshot figures', len(figures), 5)
    truth = page.evaluate("""() => {
      const t = OC.store.state.todos.filter(x => !x.archived);
      return {done: t.filter(x => x.state === 'done').length, left: t.filter(x => x.state !== 'done').length};
    }""")
    ok('tasks complete matches the data', figures[1].strip(), str(truth['done']))
    ok('tasks left matches the data', figures[2].strip(), str(truth['left']))
    with page.expect_download() as dl:
        page.click('button:has-text("Export todos to CSV")')
    csv = pathlib.Path(dl.value.path()).read_text().strip().split('\n')
    ok('the CSV header is right', csv[0].startswith('Title,Client,Department'))
    ok('one row per visible todo', len(csv) - 1, truth['done'] + truth['left'])

    print('\n=== signing out ===')
    sign_out()
    ok('back to the gate', page.locator('.signin-card').count(), 1)
    ok('and the board is gone', page.locator('.panel--todos').count(), 0)
    ok('the session cookie is cleared', page.evaluate("document.cookie.indexOf('oc_session') === -1"))

    pathlib.Path(SCR).mkdir(parents=True, exist_ok=True)
    page.screenshot(path=SCR + 'verified.png')

    print('\npassed: ' + str(passed))
    print('JS errors:', errs or 'none')
    print('FAILURES:', fails or 'none')
    browser.close()

SERVER.terminate()
SERVER.wait(timeout=10)
sys.exit(1 if (fails or errs) else 0)
