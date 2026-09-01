/* =========================================================================
   profile_portal.js — Employee Profile, Attendance & Leave Portal
   Provides a comprehensive personal HR & operations service portal:
   - Full 4-section employee credentials & profile cards
   - Real-time attendance punch-in/out & monthly log tables
   - Dynamic leave balance tracking & formal application submissions
   Originate Command · application
   ========================================================================= */

window.OC = window.OC || {};

OC.profilePortal = (function () {
  'use strict';

  function h() { return OC.ui.h.apply(null, arguments); }
  function me() { return OC.store.user(OC.store.session()); }

  var activeTab = 'profile'; /* 'profile' | 'attendance' | 'leave' */
  var selectedMonth = '2026-09';

  /* ---- Defaults generator for user profile sections ---------------------- */
  function getUserProfile(user) {
    if (!user) return {};
    var empId = user.employee_id || (user.id ? user.id.replace('u-', 'EMP-').toUpperCase() : 'EMP-1188');
    var org = user.org || 'MUNSHE IT';
    var joined = user.joined_date || '23-Jul-2026';

    var off = user.office_details || {
      date_of_joining: joined,
      probation_end_date: '31-Aug-2026',
      office_phone: 'N/A',
      lastpass_email: user.email || 'N/A',
      workstation_pw: 'Upwork',
      salary_venture: org
    };

    var per = user.personal_details || {
      dob: '18-Dec-2002',
      blood_group: 'O+',
      personal_phone: '01902780443',
      personal_email: user.email || 'fuadkalaroa2002@gmail.com',
      nid: '2863159758',
      marital_status: 'Single'
    };

    var emg = user.emergency_contacts || {
      primary_name: 'Md. Jahidur Rahman (Father)',
      primary_phone: '01740864762',
      fathers_name: 'Md. Jahidur Rahman',
      mothers_name: 'Mst. Mosewara Khatun'
    };

    var bnk = user.bank_details || {
      bank_name: 'NRBC Bank',
      account_name: user.name || 'Md. Abdullah Al Fuad',
      account_number: 'N/A',
      highest_degree: 'BSc (CSE)'
    };

    return { empId: empId, org: org, joined: joined, office: off, personal: per, emergency: emg, bank: bnk };
  }

  /* ---- Edit Section Modal ------------------------------------------------ */
  function editSectionModal(sectionKey, title, fields, onSave) {
    var user = me();
    if (!user) return;
    var prof = getUserProfile(user);
    var targetObj = (sectionKey === 'office') ? prof.office
      : (sectionKey === 'personal') ? prof.personal
      : (sectionKey === 'emergency') ? prof.emergency
      : prof.bank;

    var inputs = {};
    var formElements = fields.map(function (f) {
      var val = targetObj[f.key] || '';
      var input = h('input', { type: f.type || 'text', value: val, placeholder: f.placeholder || '' });
      inputs[f.key] = input;
      return OC.ui.field(f.label, input, { hint: f.hint });
    });

    OC.ui.modal({
      title: 'Edit ' + title,
      content: h('div', { class: 'form-body', style: 'gap:12px;display:flex;flex-direction:column;' }, formElements),
      actions: [
        { label: 'Cancel', onClick: function (close) { close(); } },
        {
          label: 'Save Changes', primary: true, onClick: function (close) {
            var updated = {};
            fields.forEach(function (f) {
              updated[f.key] = inputs[f.key].value.trim() || 'N/A';
            });

            OC.store.mutate({
              actor: user.id,
              action: 'user.update_profile_section',
              target: user.name,
              detail: 'Updated ' + title
            }, function () {
              var targetUser = OC.store.user(user.id);
              if (sectionKey === 'office') {
                if (targetUser) targetUser.office_details = updated;
                user.office_details = updated;
              } else if (sectionKey === 'personal') {
                if (targetUser) targetUser.personal_details = updated;
                user.personal_details = updated;
              } else if (sectionKey === 'emergency') {
                if (targetUser) targetUser.emergency_contacts = updated;
                user.emergency_contacts = updated;
              } else if (sectionKey === 'bank') {
                if (targetUser) targetUser.bank_details = updated;
                user.bank_details = updated;
              }
            });

            OC.ui.toast(title + ' updated successfully.');
            if (typeof onSave === 'function') onSave();
            close();
          }
        }
      ]
    });
  }

  /* ---- 1. Employee Profile Tab View -------------------------------------- */
  function renderProfileTab(user, rerender) {
    var prof = getUserProfile(user);
    var deptNames = (user.departments && user.departments.length)
      ? user.departments.map(function (m) { return (OC.store.department(m.department) || {}).name; }).join(', ')
      : (user.admin ? 'Operations & System Administration' : 'General');

    var banner = h('div', { class: 'user-profile-banner', style: 'margin-bottom:24px;' }, [
      h('div', { class: 'user-profile-banner-left' }, [
        h('div', { class: 'user-profile-avatar-wrap' }, [
          user.avatar
            ? h('img', { src: user.avatar, alt: user.name })
            : h('div', { class: 'user-profile-avatar-placeholder' }, OC.ui.initials(user.name))
        ]),
        h('div', { class: 'user-profile-info' }, [
          h('div', { class: 'user-profile-title-row' }, [
            h('span', { class: 'user-profile-name' }, user.name),
            h('span', { class: 'user-profile-badge' }, prof.empId)
          ]),
          h('div', { class: 'user-profile-role-line' }, (user.title || 'Intern') + ' • ' + deptNames),
          h('div', { class: 'user-profile-meta-line' }, 'Joined ' + prof.joined + ' (' + prof.org + ')')
        ])
      ]),
      h('div', { class: 'user-profile-right' }, [
        h('div', { class: 'user-profile-status-badge' }, [
          h('div', { class: 'user-profile-status-label' }, 'OFFICIAL EMAIL'),
          h('div', { class: 'user-profile-status-val' }, 'Verified Portal Active')
        ]),
        h('button', {
          class: 'btn small primary',
          type: 'button',
          onClick: function () {
            if (OC.app && OC.app.openProfileModal) {
              OC.app.openProfileModal(user, rerender);
            }
          }
        }, ['✏️ Edit Card'])
      ])
    ]);

    function infoRow(label, val) {
      return h('div', { class: 'portal-info-item' }, [
        h('span', { class: 'portal-info-label' }, label),
        h('span', { class: 'portal-info-val' }, val || 'N/A')
      ]);
    }

    function cardWrapper(iconKey, title, sectionKey, fields, contentNodes) {
      return h('div', { class: 'portal-credential-card' }, [
        h('div', { class: 'portal-card-header' }, [
          h('div', { class: 'portal-card-title' }, [
            h('span', { class: 'portal-card-icon' }, OC.icon(iconKey) || '📋'),
            h('span', { class: 'portal-card-heading-text' }, title)
          ]),
          h('button', {
            class: 'portal-card-edit-btn',
            type: 'button',
            title: 'Edit ' + title,
            onClick: function () {
              editSectionModal(sectionKey, title, fields, rerender);
            }
          }, ['✏️ Edit'])
        ]),
        h('div', { class: 'portal-card-grid' }, contentNodes)
      ]);
    }

    /* 4 Card sections matching Photo 3 */
    var card1 = cardWrapper('file', 'OFFICE & IT CREDENTIALS', 'office', [
      { key: 'date_of_joining', label: 'Date of Joining', placeholder: '23-Jul-2026' },
      { key: 'probation_end_date', label: 'Probation End Date', placeholder: '31-Aug-2026' },
      { key: 'office_phone', label: 'Office Phone' },
      { key: 'lastpass_email', label: 'Lastpass / Work Email' },
      { key: 'workstation_pw', label: 'PC Password / Account' },
      { key: 'salary_venture', label: 'Salary Venture / Org', placeholder: 'MUNSHE IT' }
    ], [
      infoRow('Date of Joining:', prof.office.date_of_joining),
      infoRow('Probation End Date:', prof.office.probation_end_date),
      infoRow('Office Phone:', prof.office.office_phone),
      infoRow('Lastpass Email:', prof.office.lastpass_email),
      infoRow('PC Password:', prof.office.workstation_pw),
      infoRow('Salary Venture:', prof.office.salary_venture)
    ]);

    var card2 = cardWrapper('user', 'PERSONAL DETAILS', 'personal', [
      { key: 'dob', label: 'Date of Birth', placeholder: '18-Dec-2002' },
      { key: 'blood_group', label: 'Blood Group', placeholder: 'O+' },
      { key: 'personal_phone', label: 'Personal Phone', placeholder: '01902780443' },
      { key: 'personal_email', label: 'Personal Email' },
      { key: 'nid', label: 'NID Number', placeholder: '2863159758' },
      { key: 'marital_status', label: 'Marital Status', placeholder: 'Single' }
    ], [
      infoRow('Date of Birth:', prof.personal.dob),
      infoRow('Blood Group:', prof.personal.blood_group),
      infoRow('Personal Phone:', prof.personal.personal_phone),
      infoRow('Personal Email:', prof.personal.personal_email),
      infoRow('NID Number:', prof.personal.nid),
      infoRow('Marital Status:', prof.personal.marital_status)
    ]);

    var card3 = cardWrapper('bell', 'EMERGENCY CONTACTS', 'emergency', [
      { key: 'primary_name', label: 'Primary Contact & Relation', placeholder: 'Md. Jahidur Rahman (Father)' },
      { key: 'primary_phone', label: 'Primary Phone', placeholder: '01740864762' },
      { key: 'fathers_name', label: "Father's Name", placeholder: 'Md. Jahidur Rahman' },
      { key: 'mothers_name', label: "Mother's Name", placeholder: 'Mst. Mosewara Khatun' }
    ], [
      h('div', { class: 'portal-emergency-highlight' }, [
        h('div', { class: 'portal-emergency-tag' }, 'PRIMARY EMERGENCY CONTACT'),
        h('div', { class: 'portal-emergency-name' }, prof.emergency.primary_name || 'Md. Jahidur Rahman (Father)'),
        h('div', { class: 'portal-emergency-phone' }, prof.emergency.primary_phone || '01740864762')
      ]),
      infoRow("Father's Name:", prof.emergency.fathers_name),
      infoRow("Mother's Name:", prof.emergency.mothers_name)
    ]);

    var card4 = cardWrapper('credit-card', 'BANK & COMPENSATION DETAILS', 'bank', [
      { key: 'bank_name', label: 'Bank / MFS Name', placeholder: 'NRBC Bank / bKash' },
      { key: 'account_name', label: 'Account Name' },
      { key: 'account_number', label: 'Account / Wallet Number' },
      { key: 'highest_degree', label: 'Highest Degree', placeholder: 'BSc (CSE)' }
    ], [
      infoRow('Bank Name:', prof.bank.bank_name),
      infoRow('Account Name:', prof.bank.account_name),
      infoRow('Bank Account Number:', prof.bank.account_number),
      infoRow('Highest Degree:', prof.bank.highest_degree)
    ]);

    return h('div', { class: 'portal-view-content' }, [
      banner,
      h('div', { class: 'portal-cards-2x2' }, [
        card1, card2, card3, card4
      ])
    ]);
  }

  /* ---- 2. My Attendance Tab View (Photo 4) -------------------------------- */
  function renderAttendanceTab(user, rerender) {
    var allAtt = OC.store.state.attendance || [];
    var myLogs = allAtt.filter(function (a) { return a.user_id === user.id; });
    var todayStr = new Date().toISOString().slice(0, 10);
    var todayLog = myLogs.find(function (a) { return a.date === todayStr; });

    // Calculate stats
    var currentMonthLogs = myLogs.filter(function (a) { return a.date && a.date.indexOf(selectedMonth) === 0; });
    var daysLogged = currentMonthLogs.length;
    var lateCount = currentMonthLogs.filter(function (a) { return a.status === 'Late'; }).length;
    var fyLates = myLogs.filter(function (a) { return a.status === 'Late'; }).length;

    function openAttendanceTimeModal(existingLog) {
      var now = new Date();
      var defaultIn = existingLog && existingLog.punch_in ? existingLog.punch_in : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      var defaultOut = existingLog && existingLog.punch_out ? existingLog.punch_out : '';

      var dateInput = h('input', {
        type: 'date',
        value: todayStr,
        min: todayStr,
        max: todayStr,
        disabled: true,
        style: 'background:rgba(255,255,255,0.06);color:var(--text-secondary);cursor:not-allowed;font-weight:600;'
      });

      var inTimeInput = h('input', {
        type: 'text',
        placeholder: 'e.g. 10:00 AM',
        value: defaultIn,
        style: 'font-weight:700;'
      });

      var outTimeInput = h('input', {
        type: 'text',
        placeholder: 'e.g. 06:30 PM (optional)',
        value: defaultOut,
        style: 'font-weight:700;'
      });

      var noteInput = h('input', {
        type: 'text',
        placeholder: 'Operational note (optional)',
        value: existingLog ? (existingLog.note || '') : 'Manual In/Out log entry'
      });

      OC.ui.modal({
        title: 'Daily Attendance Time Entry (Today)',
        content: h('div', { class: 'form-body', style: 'display:flex;flex-direction:column;gap:12px;' }, [
          h('div', { class: 'callout info', style: 'font-size:12px;padding:8px 12px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.25);border-radius:6px;' },
            '🔒 System Policy: Past dates and historical timestamps are locked for audit compliance. You can only enter or adjust In/Out time for Today (' + todayStr + ').'
          ),
          OC.ui.field('Date (Locked to Today)', dateInput, { hint: 'Past dates are blocked.' }),
          OC.ui.field('In Time (Punch In) *', inTimeInput, { hint: 'Format: HH:MM AM/PM (e.g. 10:00 AM)' }),
          OC.ui.field('Out Time (Punch Out)', outTimeInput, { hint: 'Format: HH:MM AM/PM (leave blank if currently active)' }),
          OC.ui.field('Remark / Note', noteInput)
        ]),
        actions: [
          { label: 'Cancel', onClick: function (close) { close(); } },
          {
            label: 'Save Attendance Entry',
            primary: true,
            onClick: function (close) {
              var inVal = inTimeInput.value.trim();
              var outVal = outTimeInput.value.trim();
              if (!inVal) {
                OC.ui.toast('Please specify a valid In Time.', true);
                return;
              }

              OC.store.mutate({
                actor: user.id,
                action: 'attendance.manual_time_entry',
                target: user.name,
                detail: 'Recorded In: ' + inVal + (outVal ? ', Out: ' + outVal : '')
              }, function () {
                var allAtt = OC.store.state.attendance || [];
                var target = allAtt.find(function (a) { return a.user_id === user.id && a.date === todayStr; });
                var isLate = inVal.toLowerCase().indexOf('pm') > -1 || (function () {
                  var match = inVal.match(/(\d+):(\d+)\s*(am|pm)/i);
                  if (!match) return false;
                  var hh = parseInt(match[1], 10);
                  var mm = parseInt(match[2], 10);
                  var ampm = match[3].toLowerCase();
                  if (ampm === 'am' && (hh > 10 || (hh === 10 && mm > 15))) return true;
                  if (ampm === 'pm') return true;
                  return false;
                })();

                if (target) {
                  target.punch_in = inVal;
                  target.punch_out = outVal || null;
                  target.status = isLate ? 'Late' : 'Present';
                  target.note = noteInput.value.trim() || 'Manual time entry';
                } else {
                  OC.store.state.attendance.unshift({
                    id: OC.store.uid('att'),
                    user_id: user.id,
                    date: todayStr,
                    scheduled_in: '10:00 AM',
                    punch_in: inVal,
                    punch_out: outVal || null,
                    status: isLate ? 'Late' : 'Present',
                    note: noteInput.value.trim() || 'Manual time entry'
                  });
                }
              });

              OC.ui.toast('Attendance In/Out time recorded and stored in database. ✅');
              rerender();
              close();
            }
          }
        ]
      });
    }

    function handlePunch() {
      var nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      OC.store.mutate({
        actor: user.id,
        action: 'attendance.punch',
        target: user.name,
        detail: 'Punched at ' + nowTime
      }, function () {
        var existing = (OC.store.state.attendance || []).find(function (a) { return a.user_id === user.id && a.date === todayStr; });
        if (!existing) {
          var isLate = new Date().getHours() >= 10 && new Date().getMinutes() > 15;
          OC.store.state.attendance.unshift({
            id: OC.store.uid('att'),
            user_id: user.id,
            date: todayStr,
            scheduled_in: '10:00 AM',
            punch_in: nowTime,
            punch_out: null,
            status: isLate ? 'Late' : 'Present',
            note: 'Self-punched in'
          });
          OC.ui.toast('Punch In recorded successfully at ' + nowTime + ' ✅');
        } else if (!existing.punch_out) {
          existing.punch_out = nowTime;
          OC.ui.toast('Punch Out recorded successfully at ' + nowTime + ' 🏁');
        } else {
          existing.punch_out = nowTime;
          OC.ui.toast('Punch Out updated at ' + nowTime + ' 🏁');
        }
      });
      rerender();
    }

    var punchBtnLabel = !todayLog
      ? '⏱️ Quick Punch In'
      : (!todayLog.punch_out ? '🏁 Quick Punch Out (' + todayLog.punch_in + ')' : '🔄 Re-Punch Out (' + todayLog.punch_out + ')');

    return h('div', { class: 'portal-view-content' }, [
      h('div', { class: 'portal-header-box' }, [
        h('div', {}, [
          h('h2', { class: 'portal-view-title' }, [OC.icon('clock') || '🕒', ' My Attendance Record']),
          h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
            'Punch machine & self-checkin logs for ' + user.name + ' (' + (user.employee_id || 'EMP-1188') + '). Standard Scheduled In-Time: 10:00 AM.'
          )
        ]),
        h('div', { class: 'row', style: 'gap:10px;align-items:center;flex-wrap:wrap;' }, [
          h('button', {
            class: 'btn',
            type: 'button',
            style: 'font-weight:600;display:inline-flex;align-items:center;gap:6px;',
            onClick: function () { openAttendanceTimeModal(todayLog); }
          }, ['✏️ Manual In/Out Entry']),
          h('button', {
            class: 'btn primary',
            type: 'button',
            style: 'font-weight:700;',
            onClick: handlePunch
          }, [punchBtnLabel])
        ])
      ]),

      /* 3 Metric Stat Cards matching Photo 4 */
      h('div', { class: 'portal-stats-row' }, [
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Days Logged'),
          h('div', { class: 'portal-stat-value' }, daysLogged + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'In ' + selectedMonth)
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Late Count (Sep)'),
          h('div', { class: 'portal-stat-value' + (lateCount > 0 ? ' alert' : '') }, lateCount + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'Limit before deduction: 3 Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Fiscal Year Total Lates'),
          h('div', { class: 'portal-stat-value' }, fyLates + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'FY 2026-2027')
        ])
      ]),

      /* Table: Daily Attendance Logs */
      h('div', { class: 'portal-table-container' }, [
        h('div', { class: 'portal-table-head' }, [
          h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
            h('h3', {}, 'Daily Attendance Logs (' + selectedMonth + ')'),
            h('span', { class: 'chip count' }, currentMonthLogs.length + ' entries')
          ]),
          h('button', {
            class: 'btn small',
            type: 'button',
            style: 'font-size:12px;',
            onClick: function () { openAttendanceTimeModal(todayLog); }
          }, ['➕ Record Today In/Out Time'])
        ]),
        h('div', { class: 'tablewrap' }, [
          h('table', {}, [
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col' }, 'DATE'),
              h('th', { scope: 'col' }, 'SCHEDULED IN'),
              h('th', { scope: 'col' }, 'PUNCH IN'),
              h('th', { scope: 'col' }, 'PUNCH OUT'),
              h('th', { scope: 'col' }, 'STATUS'),
              h('th', { scope: 'col' }, 'ACTIONS')
            ])),
            h('tbody', {}, currentMonthLogs.length
              ? currentMonthLogs.map(function (log) {
                  var statusChipClass = (log.status === 'Present') ? 'chip success'
                    : (log.status === 'Late') ? 'chip warning'
                    : 'chip';
                  var isToday = log.date === todayStr;

                  var actionCell = isToday
                    ? h('button', {
                        class: 'btn small',
                        type: 'button',
                        style: 'font-size:11px;padding:3px 8px;',
                        title: 'Adjust today In/Out time',
                        onClick: function () { openAttendanceTimeModal(log); }
                      }, ['✏️ Adjust Time'])
                    : h('span', {
                        class: 'chip',
                        style: 'font-size:11px;color:var(--text-secondary);opacity:0.75;',
                        title: 'Past date attendance is locked and tamper-evident'
                      }, ['🔒 Locked (Past Date)']);

                  return h('tr', {}, [
                    h('td', { class: 'mono bold' }, log.date),
                    h('td', { class: 'muted mono' }, log.scheduled_in || '10:00 AM'),
                    h('td', { class: 'mono bold' }, log.punch_in || '—'),
                    h('td', { class: 'mono' }, log.punch_out || '—'),
                    h('td', {}, h('span', { class: statusChipClass }, log.status || 'Present')),
                    h('td', {}, actionCell)
                  ]);
                })
              : [
                  h('tr', {}, [
                    h('td', { colspan: '6', style: 'text-align:center;padding:28px;color:var(--text-secondary);' },
                      'No punch logs recorded for ' + selectedMonth + '. Use the "Record Today In/Out Time" or "Punch In" button above to log your time today.')
                  ])
                ]
            )
          ])
        ])
      ])
    ]);
  }

  /* ---- 3. Leave Portal Tab View (Photo 2) --------------------------------- */
  function renderLeaveTab(user, rerender) {
    var allLeaves = OC.store.state.leaves || [];
    var myLeaves = allLeaves.filter(function (l) { return l.user_id === user.id; });

    // Calculate used leaves
    var usedCL = 0, usedEL = 0, usedSL = 0, usedWP = 0;
    myLeaves.forEach(function (l) {
      if (l.status !== 'Rejected') {
        usedCL += Number(l.cl_days || 0);
        usedEL += Number(l.el_days || 0);
        usedSL += Number(l.sl_days || 0);
        usedWP += Number(l.wp_days || 0);
      }
    });

    var totalCL = 10, totalEL = 12, totalSL = 14;
    var remCL = Math.max(0, totalCL - usedCL);
    var remEL = Math.max(0, totalEL - usedEL);
    var remSL = Math.max(0, totalSL - usedSL);
    var totalRem = remCL + remEL + remSL;

    // Form inputs
    var fromInput = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    var toInput = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    var managerSelect = OC.ui.select(
      OC.store.state.users.filter(function (u) { return u.admin || (u.id !== user.id); }).map(function (u) {
        return { value: u.id, label: u.name + ' (' + (u.title || 'Lead') + ')' };
      }),
      'u-shohag'
    );

    var clInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var elInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var slInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var wpInput = h('input', { type: 'number', step: '0.5', min: '0', value: '0', style: 'font-weight:700;' });
    var reasonInput = h('textarea', { rows: '3', placeholder: 'State clear operational reason for leave...' });

    function setQuick(input, val) {
      input.value = String(val);
    }

    function quickControls(input) {
      return h('div', { class: 'portal-quick-chips' }, [
        h('button', { type: 'button', class: 'portal-quick-btn', onClick: function () { setQuick(input, 0.5); } }, '0.5'),
        h('button', { type: 'button', class: 'portal-quick-btn', onClick: function () { setQuick(input, 1.0); } }, '1.0'),
        h('button', { type: 'button', class: 'portal-quick-btn', onClick: function () { setQuick(input, 1.5); } }, '1.5'),
        h('button', { type: 'button', class: 'portal-quick-btn clear', onClick: function () { setQuick(input, 0); } }, 'Clear')
      ]);
    }

    function submitApplication(e) {
      if (e) e.preventDefault();
      var cl = parseFloat(clInput.value) || 0;
      var el = parseFloat(elInput.value) || 0;
      var sl = parseFloat(slInput.value) || 0;
      var wp = parseFloat(wpInput.value) || 0;
      var totalApplied = cl + el + sl + wp;

      if (totalApplied <= 0) {
        OC.ui.toast('Please specify at least 0.5 days for one leave category.', true);
        return;
      }
      if (!reasonInput.value.trim()) {
        OC.ui.toast('Please provide a reason for the leave application.', true);
        return;
      }

      var mgrUser = OC.store.user(managerSelect.value);
      var appObj = {
        id: OC.store.uid('lv'),
        user_id: user.id,
        from_date: fromInput.value,
        to_date: toInput.value,
        manager_id: managerSelect.value,
        manager_name: mgrUser ? mgrUser.name : 'System Admin',
        cl_days: cl,
        el_days: el,
        sl_days: sl,
        wp_days: wp,
        reason: reasonInput.value.trim(),
        status: 'Pending',
        submitted_at: new Date().toISOString()
      };

      OC.store.mutate({
        actor: user.id,
        action: 'leave.submit',
        target: user.name,
        detail: 'Applied for ' + totalApplied + ' days leave (' + fromInput.value + ' to ' + toInput.value + ')'
      }, function () {
        OC.store.state.leaves.unshift(appObj);
      });

      OC.ui.toast('🎉 Leave application submitted & recorded in database.');
      rerender();
    }

    return h('div', { class: 'portal-view-content' }, [
      h('div', { class: 'portal-header-box' }, [
        h('div', {}, [
          h('h2', { class: 'portal-view-title' }, [OC.icon('send') || '✈️', ' Leave Portal & Formal Applications']),
          h('p', { class: 'muted', style: 'font-size:13px;margin:2px 0 0;' },
            'Apply for leave, track real-time credit balances, and print official HR leave forms for ' + user.name + '.'
          )
        ])
      ]),

      /* 4 Leave Balances Badges matching Photo 2 */
      h('div', { class: 'portal-stats-row' }, [
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Casual Leave (CL)'),
          h('div', { class: 'portal-stat-value success' }, usedCL + ' / ' + totalCL + ' Left'),
          h('div', { class: 'portal-stat-sub' }, 'Used: ' + usedCL + ' Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Earned Leave (EL)'),
          h('div', { class: 'portal-stat-value info' }, usedEL + ' / ' + totalEL + ' Left'),
          h('div', { class: 'portal-stat-sub' }, 'Used: ' + usedEL + ' Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Sick Leave (SL)'),
          h('div', { class: 'portal-stat-value warn' }, usedSL + ' / ' + totalSL + ' Left'),
          h('div', { class: 'portal-stat-sub' }, 'Used: ' + usedSL + ' Days')
        ]),
        h('div', { class: 'portal-stat-card' }, [
          h('div', { class: 'portal-stat-label' }, 'Total Remaining'),
          h('div', { class: 'portal-stat-value' }, totalRem + ' Days'),
          h('div', { class: 'portal-stat-sub' }, 'Without Pay: ' + usedWP + ' Days')
        ])
      ]),

      /* Application Form */
      h('div', { class: 'portal-form-container' }, [
        h('h3', { class: 'portal-form-heading' }, '+ Submit Dynamic Leave Application'),
        h('form', { onSubmit: submitApplication }, [
          h('div', { class: 'portal-form-grid-3' }, [
            OC.ui.field('Leave From Date *', fromInput, { required: true }),
            OC.ui.field('Leave To Date *', toInput, { required: true }),
            OC.ui.field('Reporting Lead / Manager *', managerSelect, { required: true })
          ]),

          h('div', { style: 'margin:14px 0 8px;' }, [
            h('span', { class: 'portal-spec-title' }, 'SPECIFY DAYS PER CATEGORY (TOTAL APPLIED):'),
            h('span', { class: 'portal-spec-hint' }, 'Supports Half-Day (0.5, 1.5, 2.5) & Full-Day Values')
          ]),

          h('div', { class: 'portal-form-grid-4' }, [
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Casual Leave (CL)'),
              clInput,
              quickControls(clInput)
            ]),
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Earned Leave (EL)'),
              elInput,
              quickControls(elInput)
            ]),
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Sick Leave (SL)'),
              slInput,
              quickControls(slInput)
            ]),
            h('div', { class: 'portal-leave-alloc-box' }, [
              h('label', {}, 'Without Pay (WP)'),
              wpInput,
              quickControls(wpInput)
            ])
          ]),

          h('div', { style: 'margin-top:14px;' }, [
            OC.ui.field('Detailed Reason for Leave *', reasonInput, { required: true })
          ]),

          h('div', { style: 'display:flex;justify-content:flex-end;margin-top:16px;' }, [
            h('button', {
              class: 'btn primary',
              type: 'submit',
              style: 'background:linear-gradient(135deg, #ea580c 0%, #c2410c 100%);color:#fff;font-weight:700;padding:9px 20px;'
            }, 'Submit Application & Generate Document')
          ])
        ])
      ]),

      /* Table: My Submitted Leave Applications */
      h('div', { class: 'portal-table-container', style: 'margin-top:24px;' }, [
        h('div', { class: 'portal-table-head' }, [
          h('h3', {}, 'My Submitted Leave Applications'),
          h('span', { class: 'chip count' }, myLeaves.length + ' applications')
        ]),
        h('div', { class: 'tablewrap' }, [
          h('table', {}, [
            h('thead', {}, h('tr', {}, [
              h('th', { scope: 'col' }, 'SUBMITTED'),
              h('th', { scope: 'col' }, 'PERIOD (FROM - TO)'),
              h('th', { scope: 'col' }, 'BREAKDOWN'),
              h('th', { scope: 'col' }, 'REPORTING TO'),
              h('th', { scope: 'col' }, 'REASON'),
              h('th', { scope: 'col' }, 'STATUS')
            ])),
            h('tbody', {}, myLeaves.length
              ? myLeaves.map(function (app) {
                  var stClass = (app.status === 'Approved') ? 'chip success'
                    : (app.status === 'Rejected') ? 'chip alert'
                    : 'chip warning';
                  var breakdown = [];
                  if (app.cl_days > 0) breakdown.push(app.cl_days + ' CL');
                  if (app.el_days > 0) breakdown.push(app.el_days + ' EL');
                  if (app.sl_days > 0) breakdown.push(app.sl_days + ' SL');
                  if (app.wp_days > 0) breakdown.push(app.wp_days + ' WP');

                  return h('tr', {}, [
                    h('td', { class: 'mono' }, app.submitted_at ? app.submitted_at.slice(0, 10) : 'Today'),
                    h('td', { class: 'mono bold' }, app.from_date + ' → ' + app.to_date),
                    h('td', {}, breakdown.join(', ') || '1 Day'),
                    h('td', {}, app.manager_name || 'System Admin'),
                    h('td', { class: 'muted', style: 'max-width:200px;' }, app.reason),
                    h('td', {}, h('span', { class: stClass }, app.status || 'Pending'))
                  ]);
                })
              : [
                  h('tr', {}, [
                    h('td', { colspan: '6', style: 'text-align:center;padding:28px;color:var(--text-secondary);' },
                      'No leave applications submitted yet.')
                  ])
                ]
            )
          ])
        ])
      ])
    ]);
  }

  /* ---- Main Render Entry ------------------------------------------------ */
  function render(host, rerender) {
    var user = me();
    if (!user) return;

    var sidebarItems = [
      { id: 'profile', label: 'Employee Profile', icon: 'user' },
      { id: 'attendance', label: 'My Attendance', icon: 'clock' },
      { id: 'leave', label: 'Leave Portal', icon: 'send' }
    ];

    var sidebar = h('aside', { class: 'portal-sidebar' }, [
      h('div', { class: 'portal-sidebar-brand' }, [
        h('div', { class: 'portal-sidebar-tag' }, 'ACTIVE PORTAL'),
        h('div', { class: 'portal-sidebar-title' }, 'Employee Portal')
      ]),
      h('nav', { class: 'portal-sidebar-nav' }, sidebarItems.map(function (item) {
        var isActive = activeTab === item.id;
        return h('button', {
          type: 'button',
          class: 'portal-nav-btn' + (isActive ? ' active' : ''),
          onClick: function () {
            activeTab = item.id;
            render(host, rerender);
          }
        }, [
          h('span', { class: 'portal-nav-icon' }, OC.icon(item.icon) || '•'),
          h('span', { class: 'portal-nav-label' }, item.label)
        ]);
      })),
      h('div', { class: 'portal-sidebar-footer' }, [
        h('button', {
          class: 'btn small',
          type: 'button',
          style: 'width:100%;display:flex;align-items:center;justify-content:center;gap:6px;',
          onClick: function () {
            if (OC.app && OC.app.go) OC.app.go('dashboard');
          }
        }, ['← Back to Dashboard'])
      ])
    ]);

    var mainContent = (activeTab === 'attendance')
      ? renderAttendanceTab(user, function () { render(host, rerender); })
      : (activeTab === 'leave')
        ? renderLeaveTab(user, function () { render(host, rerender); })
        : renderProfileTab(user, function () { render(host, rerender); });

    var layout = h('div', { class: 'portal-layout-container' }, [
      sidebar,
      h('main', { class: 'portal-main-area' }, [
        mainContent
      ])
    ]);

    OC.ui.clear(host);
    OC.ui.append(host, [layout]);
  }

  return {
    render: render,
    setActiveTab: function (tab) { activeTab = tab; }
  };
})();
