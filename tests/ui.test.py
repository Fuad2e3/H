"""UI suite — every view function driven through a real browser.
Run from the repository root:  python3 tests/ui.test.py
Set CHROME_PATH if Chromium lives somewhere else.
Originate Command · application
"""
from playwright.sync_api import sync_playwright
import pathlib, sys
import os
CHROME=os.environ.get('CHROME_PATH','/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
url = pathlib.Path('index.html').resolve().as_uri()
SCR=str(pathlib.Path('tests/.screenshots').resolve())+'/'
passed=0; fails=[]
def ok(label, got, want=True):
    global passed
    if got==want: passed+=1; print("  PASS "+label)
    else: fails.append(label); print("  FAIL "+label+f"   got={got!r} want={want!r}")

with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME,args=['--no-sandbox'])
    page=b.new_page(viewport={'width':1400,'height':1000}); errs=[]
    page.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
    page.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'fonts.g' not in m.text and 'ERR_CONN' not in m.text else None)
    page.goto(url,wait_until='domcontentloaded'); page.wait_for_timeout(400)
    nav=lambda n:(page.get_by_role('button',name=n,exact=True).click(),page.wait_for_timeout(300))
    au=lambda l:(page.select_option('.who select',label=l),page.wait_for_timeout(300))
    ds=lambda i:page.locator('dialog select').nth(i)
    dtxt=lambda i:page.locator('dialog input[type=text]').nth(i)

    print("\n=== app.js: routing, theme, notifications ===")
    for view,heading in [('Dashboard','Good to see you'),('Board','Board'),('Groups','Groups'),('Reports','Reports'),('People','People and departments')]:
        nav(view); ok(f"route {view}", heading in page.locator('.page-head h1').first.inner_text())
    ok("hash reflects the route", page.evaluate("location.hash"), "#people")
    page.go_back(); page.wait_for_timeout(400)
    ok("browser back changes view", page.evaluate("location.hash"), "#reports")
    page.goto(url+"#groups", wait_until='domcontentloaded'); page.wait_for_timeout(400)
    ok("deep link opens that view", page.locator('.page-head h1').first.inner_text(), "Groups")
    ok("nav marks the current page", page.locator('.nav button[aria-current="page"]').inner_text(), "Groups")

    t=page.locator('.toggle-theme')
    ok("theme starts on system", t.inner_text(), "Theme: system")
    t.click(); page.wait_for_timeout(150)
    ok("theme cycles to dark", page.evaluate("document.documentElement.dataset.theme"), "dark")
    ok("dark repaints the page", page.evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(12, 17, 31)")
    t.click(); page.wait_for_timeout(150)
    ok("theme cycles to light", page.evaluate("document.documentElement.dataset.theme"), "light")
    page.reload(wait_until='domcontentloaded'); page.wait_for_timeout(400)
    ok("theme choice survives reload", page.locator('.toggle-theme').inner_text(), "Theme: light")
    page.locator('.toggle-theme').click(); page.wait_for_timeout(150)
    ok("theme returns to system", page.evaluate("document.documentElement.dataset.theme"), None)

    print("\n=== ui.js: modal and toast ===")
    nav('Board')
    page.get_by_role('button',name='New todo',exact=True).first.click(); page.wait_for_timeout(250)
    ok("modal opens", page.locator('dialog.modal').is_visible())
    page.keyboard.press('Escape'); page.wait_for_timeout(250)
    ok("Escape closes the modal", page.locator('dialog.modal').count(), 0)
    page.get_by_role('button',name='New todo',exact=True).first.click(); page.wait_for_timeout(250)
    page.click('dialog .modal-head button'); page.wait_for_timeout(250)
    ok("close button dismisses", page.locator('dialog.modal').count(), 0)

    print("\n=== board.js: filters ===")
    counts={}
    counts['all']=page.locator('.panel--todos .item').count()
    page.locator('.filters input[type=search]').fill('Chaim'); page.wait_for_timeout(350)
    ok("search filter narrows todos", page.locator('.panel--todos .item').count()<counts['all'])
    page.locator('.filters input[type=search]').fill(''); page.wait_for_timeout(300)
    page.locator('.filters select').nth(1).select_option(label='Web Development'); page.wait_for_timeout(350)
    ok("department filter", set(page.locator('.panel--todos .item .chip.dept').all_inner_texts()), {'Web Development'})
    page.locator('.filters select').nth(2).select_option(label='Ayesha Noor'); page.wait_for_timeout(350)
    ok("person filter stacks with department", page.locator('.panel--todos .item').count()>0)
    page.click('.filters button:has-text("Clear")'); page.wait_for_timeout(350)
    ok("clear restores everything", page.locator('.panel--todos .item').count(), counts['all'])
    page.locator('.filters select').nth(3).select_option(label='Urgent'); page.wait_for_timeout(350)
    ok("tag filter", page.locator('.panel--todos .item .chip:has-text("Urgent")').count()>0)
    page.click('.filters button:has-text("Clear")'); page.wait_for_timeout(300)
    page.locator('.filters input[type=date]').first.fill('2030-01-01'); page.wait_for_timeout(350)
    ok("from-date filter excludes older items", page.locator('.panel--todos .item').count(), 0)
    page.click('.filters button:has-text("Clear")'); page.wait_for_timeout(300)

    print("\n=== board.js: pinned filters ===")
    page.locator('.filters select').first.select_option(label='Chaim'); page.wait_for_timeout(300)
    page.click('.filters button:has-text("Pin filter")'); page.wait_for_timeout(250)
    dtxt(0).fill('Everything Chaim'); page.click('dialog button:has-text("Pin")'); page.wait_for_timeout(350)
    ok("pinned filter appears", page.locator('.savedbar .chip:has-text("Everything Chaim")').count(), 1)
    page.click('.filters button:has-text("Clear")'); page.wait_for_timeout(300)
    page.click('.savedbar .chip:has-text("Everything Chaim")'); page.wait_for_timeout(350)
    ok("clicking a pin reapplies it", set(page.locator('.panel--todos .item .chip.client').all_inner_texts()), {'Chaim'})
    page.click('.savedbar .chip:has-text("Everything Chaim") button'); page.wait_for_timeout(350)
    ok("pin can be removed", page.locator('.savedbar .chip:has-text("Everything Chaim")').count(), 0)
    page.click('.filters button:has-text("Clear")'); page.wait_for_timeout(300)

    print("\n=== board.js: grouping and toggles ===")
    for mode,label in [('person','Group by person'),('client','Group by client'),('department','Group by department')]:
        page.locator('.panel--todos .panel-head select').select_option(label=label); page.wait_for_timeout(350)
        ok(f"grouping by {mode} renders headings", page.locator('.panel--todos .group-head').count()>0)
    page.locator('.panel--todos .panel-head select').select_option(label='Group by person'); page.wait_for_timeout(300)
    base=page.locator('.panel--todos .item').count()
    page.check('.checkline:has-text("Show completed") input'); page.wait_for_timeout(350)
    ok("show completed reveals done work", page.locator('.panel--todos .item').count()>base)
    page.uncheck('.checkline:has-text("Show completed") input'); page.wait_for_timeout(300)

    print("\n=== board.js: recurrence across all periods ===")
    for title,period in [('Manual reply check','daily'),('Weekly sequence performance report','weekly'),
                         ('Annette: schedule the October grid','monthly'),('Quarterly client health review','quarterly')]:
        page.check('.checkline:has-text("Show completed") input'); page.wait_for_timeout(300)
        before=page.locator(f'.panel--todos .item:has-text("{title}")').count()
        row=page.locator(f'.panel--todos .item:has-text("{title}")').first
        sel=row.locator('select')
        if sel.input_value()=='done':
            sel.select_option('open'); page.wait_for_timeout(300)
            row=page.locator(f'.panel--todos .item:has-text("{title}")').first; sel=row.locator('select')
        sel.select_option('done'); page.wait_for_timeout(400)
        after=page.locator(f'.panel--todos .item:has-text("{title}")').count()
        ok(f"{period} todo regenerates", after>=before)
        page.uncheck('.checkline:has-text("Show completed") input'); page.wait_for_timeout(250)

    print("\n=== board.js: convert to todo ===")
    note=page.locator('.panel--instructions .note').first
    note.locator('button:has-text("Convert to todo")').click(); page.wait_for_timeout(300)
    page.click('dialog .modal-head button'); page.wait_for_timeout(350)
    ok("cancelling conversion leaves it unconverted",
       page.locator('.panel--instructions .note').first.locator('.chip:has-text("todo created")').count(), 0)
    page.locator('.panel--instructions .note').first.locator('button:has-text("Convert to todo")').click(); page.wait_for_timeout(300)
    ds(0).select_option(index=1); ds(1).select_option(index=1)
    page.click('dialog button:has-text("Create todo")'); page.wait_for_timeout(450)
    ok("confirming conversion marks the instruction",
       page.locator('.panel--instructions .note').first.locator('.chip:has-text("todo created")').count(), 1)

    print("\n=== board.js: read receipts and archive ===")
    unread=page.locator('.panel--instructions .note button:has-text("Mark as read")')
    n_before=unread.count()
    if n_before:
        unread.first.click(); page.wait_for_timeout(400)
        ok("mark as read removes the prompt",
           page.locator('.panel--instructions .note button:has-text("Mark as read")').count(), n_before-1)
    arch=page.locator('.panel--instructions .note button:has-text("Archive")').first
    arch.click(); page.wait_for_timeout(250)
    page.click('dialog button:has-text("Confirm")'); page.wait_for_timeout(400)
    page.check('.checkline:has-text("Show archived") input'); page.wait_for_timeout(350)
    ok("archived instruction is hidden then shown", page.locator('.note.archived').count()>0)
    page.uncheck('.checkline:has-text("Show archived") input'); page.wait_for_timeout(300)

    print("\n=== board.js: copy yesterday ===")
    page.click('button:has-text("Copy yesterday")'); page.wait_for_timeout(300)
    if page.locator('dialog').count():
        page.click('dialog button:has-text("Confirm")'); page.wait_for_timeout(400)
        moved = page.evaluate("""() => {
          const today = new Date().toISOString().slice(0,10);
          return OC.store.state.todos.some(t => t.due === today && t.state !== 'done');
        }""")
        ok("carried work is now due today", moved)
    else:
        ok("copy yesterday reports nothing to carry", page.locator('.toast').count()>0)

    print("\n=== board.js: reassign gate in the interface (6.2) ===")
    au('Rifat Chowdhury — Member')
    ok("member sees no Reassign button", page.locator('.panel--todos button:has-text("Reassign")').count(), 0)
    ok("member can still change state", page.locator('.panel--todos .item select').count()>0)
    au('Tanvir Hasan — Team Lead')
    ok("lead sees Reassign", page.locator('.panel--todos button:has-text("Reassign")').count()>0)
    page.locator('.panel--todos button:has-text("Reassign")').first.click(); page.wait_for_timeout(300)
    opts=ds(0).locator('option').all_inner_texts()
    ok("reassign list holds the lead's team", sorted([o for o in opts if '(group)' not in o]),
       ['Mim Akter','Rifat Chowdhury','Tanvir Hasan'])
    ok("plus a group he belongs to, the one line authority may cross (3.0)",
       [o for o in opts if '(group)' in o], ['Chaim Site Relaunch (group)'])
    ds(0).select_option(label='Mim Akter'); page.click('dialog button:has-text("Reassign")'); page.wait_for_timeout(400)
    ok("reassignment applied", page.locator('.panel--todos .item:has-text("Mim Akter")').count()>0)

    print("\n=== dashboard.js ===")
    au('Shohag Munshe — System Admin'); nav('Dashboard')
    stats=page.locator('.stat .v').all_inner_texts()
    ok("four dashboard stats", len(stats), 4)
    ok("stats are numeric", all(s.split()[0].isdigit() for s in stats))
    ok("dashboard has both panels", page.locator('.board .panel').count(), 2)
    ok("my clients card", page.locator('.card h3:has-text("My clients")').count(), 1)
    ok("my groups card", page.locator('.card h3:has-text("My groups")').count(), 1)
    mr=page.locator('.panel button:has-text("Mark as read")')
    if mr.count():
        c=mr.count(); mr.first.click(); page.wait_for_timeout(400)
        ok("dashboard mark-as-read works", page.locator('.panel button:has-text("Mark as read")').count(), c-1)

    print("\n=== groups.js ===")
    nav('Groups')
    page.click('button:has-text("New group")'); page.wait_for_timeout(300)
    page.click('dialog button:has-text("Create group")'); page.wait_for_timeout(200)
    ok("group needs a name", 'name' in page.locator('dialog .error').inner_text().lower())
    dtxt(0).fill('Automation Group')
    page.click('dialog button:has-text("Create group")'); page.wait_for_timeout(200)
    ok("group needs a purpose", 'for' in page.locator('dialog .error').inner_text().lower())
    page.locator('dialog textarea').fill('Testing the group flow end to end.')
    page.click('dialog button:has-text("Create group")'); page.wait_for_timeout(200)
    ok("group needs two people", 'two' in page.locator('dialog .error').inner_text().lower())
    page.locator('dialog .checkline input').nth(1).check()
    page.locator('dialog .checkline input').nth(2).check()
    page.click('dialog button:has-text("Create group")'); page.wait_for_timeout(450)
    ok("group created", page.locator('.card h3:has-text("Automation Group")').count(), 1)
    page.locator('.card:has-text("Automation Group") button:has-text("Archive")').click(); page.wait_for_timeout(250)
    page.click('dialog button:has-text("Confirm")'); page.wait_for_timeout(400)
    ok("group archived not deleted",
       page.locator('.card:has-text("Automation Group") .chip:has-text("archived")').count(), 1)

    print("\n=== reports.js ===")
    nav('Reports')
    figures=page.locator('.stat .v').all_inner_texts()
    ok("five snapshot figures", len(figures), 5)
    truth=page.evaluate("""() => {
      const me=OC.store.user(OC.store.session());
      const t=OC.store.state.todos.filter(x=>!x.archived && OC.can.seeTodo(me,x));
      return {done:t.filter(x=>x.state==='done').length, left:t.filter(x=>x.state!=='done').length};
    }""")
    ok("tasks-complete figure matches the data", figures[1].strip(), str(truth['done']))
    ok("tasks-left figure matches the data", figures[2].strip(), str(truth['left']))
    ok("per-person table present", page.locator('table caption:has-text("Per person status")').count(), 1)
    ok("historical log present", page.locator('table caption:has-text("Historical log")').count(), 1)
    with page.expect_download() as dl: page.click('button:has-text("Export todos to CSV")')
    csv=pathlib.Path(dl.value.path()).read_text().strip().split('\n')
    ok("CSV header", csv[0], 'Title,Client,Department,Assignee,State,Due,Overdue days,Recurrence,Created by')
    ok("CSV row count matches visible todos", len(csv)-1, truth['done']+truth['left'])
    ok("CSV quotes fields containing commas", all(r.count(',')>=8 for r in csv[1:]))

    print("\n=== people.js ===")
    nav('People')
    ok("six department cards", page.locator('.grid-2 .card').count(), 6)
    ok("custom hierarchy in the department's level list (3.4)",
       page.locator('.card:has-text("Outreach Operations") .chip:has-text("3. senior")').count(), 1)
    ok("and on the member who holds it",
       page.locator('.card:has-text("Outreach Operations") .chip:has-text("senior")').count(), 2)
    ok("accounts table", page.locator('table caption:has-text("Accounts")').count(), 1)
    page.click('button:has-text("Invite someone")'); page.wait_for_timeout(300)
    page.click('dialog button:has-text("Send invite")'); page.wait_for_timeout(200)
    ok("invite needs a name", 'name' in page.locator('dialog .error').inner_text().lower())
    dtxt(0).fill('Test Person'); dtxt(1).fill('not-an-email')
    page.click('dialog button:has-text("Send invite")'); page.wait_for_timeout(200)
    ok("invite validates the email", 'email' in page.locator('dialog .error').inner_text().lower())
    dtxt(1).fill('test.person@originate.example')
    ds(0).select_option(label='Outreach Operations'); page.wait_for_timeout(200)
    ok("level defaults to the narrowest (8.2)", ds(1).input_value(), 'member')
    ok("levels follow the chosen department", ds(1).locator('option').all_inner_texts(), ['head','lead','senior','member'])
    page.click('dialog button:has-text("Send invite")'); page.wait_for_timeout(450)
    ok("invited account appears as invited",
       page.locator('tr:has-text("Test Person") td:has-text("invited")').count(), 1)
    page.click('button:has-text("My notification preferences")'); page.wait_for_timeout(300)
    page.locator('dialog .checkline input').first.uncheck()
    page.click('dialog button:has-text("Save")'); page.wait_for_timeout(400)
    ok("preference saved", page.evaluate("OC.store.user(OC.store.session()).prefs.push"), False)

    print("\n=== notifications and persistence ===")
    before=page.evaluate("OC.store.state.notifications.length")
    ok("notifications exist after the run", before>0)
    page.reload(wait_until='domcontentloaded'); page.wait_for_timeout(500)
    ok("notifications survive reload", page.evaluate("OC.store.state.notifications.length"), before)
    au('Mim Akter — Senior')
    if page.locator('.iconbtn .count').count():
        page.click('.iconbtn'); page.wait_for_timeout(300)
        ok("notification list opens", page.locator('dialog .notif').count()>0)
        page.click('dialog button:has-text("Mark all read")'); page.wait_for_timeout(400)
        ok("mark all read clears the badge", page.locator('.iconbtn .count').count(), 0)
    au('Shohag Munshe — System Admin')
    ok("invited account persisted", page.evaluate("OC.store.state.users.some(u=>u.name==='Test Person')"))

    print("\n=== reset ===")
    page.click('footer button:has-text("reset data")'); page.wait_for_timeout(500)
    ok("reset restores the seeded workspace", page.evaluate("OC.store.state.todos.length"), 14)
    ok("reset clears invited test account", page.evaluate("OC.store.state.users.length"), 11)
    pathlib.Path(SCR).mkdir(parents=True, exist_ok=True)
    page.screenshot(path=SCR+'verified.png')

    print(f"\npassed: {passed}")
    print("JS errors:", errs or "none")
    print("FAILURES:", fails or "none")
    b.close()
    sys.exit(1 if (fails or errs) else 0)
