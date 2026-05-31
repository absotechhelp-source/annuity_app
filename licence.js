// ================================================================
//  VLA Annuity Tool — Licence Gate
//  ────────────────────────────────────────────────────────────────
//  To RENEW:  change LICENCE_EXPIRY to the new date (YYYY-MM-DD)
//             then redeploy this file only — index.html unchanged.
//
//  To change the warning window: update LICENCE_WARN_DAYS.
//
//  Behaviour:
//    > WARN_DAYS before expiry  : amber banner, login still works
//    within WARN_DAYS of expiry : amber banner with countdown
//    on / after expiry date     : red banner, Sign In disabled
// ================================================================

var LICENCE_EXPIRY    = '2026-06-13';  // ← update this to renew
var LICENCE_WARN_DAYS = 14;            // days before expiry to start warning

function checkLicence() {
  var expiry  = new Date(LICENCE_EXPIRY + 'T00:00:00');
  var today   = new Date(); today.setHours(0, 0, 0, 0);
  var msPerDay = 24 * 60 * 60 * 1000;
  var daysLeft = Math.ceil((expiry - today) / msPerDay);

  // e.g. "31 Dec 2026"
  var months = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
  var displayDate = expiry.getDate() + ' ' +
                    months[expiry.getMonth()] + ' ' +
                    expiry.getFullYear();

  var warnEl    = document.getElementById('lic-warn');
  var expiredEl = document.getElementById('lic-expired');
  var loginBtn  = document.getElementById('login-btn');

  if (daysLeft <= 0) {
    // ── Hard block ───────────────────────────────────────────
    document.getElementById('lic-exp-date2').textContent = displayDate;
    expiredEl.style.display = 'block';
    warnEl.style.display    = 'none';
    loginBtn.disabled       = true;
    loginBtn.title          = 'Licence expired — contact admin';
    return false;
  }

  if (daysLeft <= LICENCE_WARN_DAYS) {
    // ── Warning window ───────────────────────────────────────
    var remaining = daysLeft === 1 ? '1 day remaining'
                                   : daysLeft + ' days remaining';
    warnEl.innerHTML = '<strong>\u26a0 Licence Expiring Soon</strong>' +
                       'Expires <strong>' + displayDate + '</strong> \u2014 ' +
                       remaining + '. Contact your admin to renew.';
    warnEl.style.display    = 'block';
    expiredEl.style.display = 'none';
    return true;
  }

  // ── All clear ────────────────────────────────────────────
  warnEl.style.display    = 'none';
  expiredEl.style.display = 'none';
  return true;
}

// Run immediately when the login screen loads
document.addEventListener('DOMContentLoaded', function () {
  checkLicence();
});
