const SHEET_NAME = 'Main List';
const NOTIFY_EMAIL = 'will.and.christy.wedding@gmail.com';

const COLUMN_MAP = {
  primary_name:        'Name',
  secondary_name:      'Partner Name',
  welcome_invited:     'Invited to Welcome Drinks',
  reception_primary:   'Reception Primary RSVP',
  reception_secondary: 'Reception Secondary RSVP',
  welcome_primary:     'Welcome Primary RSVP',
  welcome_secondary:   'Welcome Secondary RSVP',
  brunch_primary:      'Brunch Primary RSVP',
  brunch_secondary:    'Brunch Secondary RSVP',
  note:                'RSVP Note',
  submitted_at:        'RSVP Submitted At',
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    if (action === 'lookup') return jsonResponse(handleLookup(payload.name));
    if (action === 'submit') return jsonResponse(handleSubmit(payload));
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: String(err && err.message || err) });
  }
}

function doGet() {
  return jsonResponse({ ok: true });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet named "' + SHEET_NAME + '" not found.');
  return sheet;
}

function normalizeHeader(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getHeaderMap(sheet) {
  const lastCol = sheet.getLastColumn();
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const indexByHeader = {};
  headerRow.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key) indexByHeader[key] = i;
  });

  const map = {};
  for (const internalKey in COLUMN_MAP) {
    const wanted = normalizeHeader(COLUMN_MAP[internalKey]);
    if (!(wanted in indexByHeader)) {
      throw new Error('Sheet column "' + COLUMN_MAP[internalKey] + '" not found. Update COLUMN_MAP in Code.gs to match your sheet headers exactly.');
    }
    map[internalKey] = indexByHeader[wanted];
  }
  return map;
}

function normalizeName(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesMatch(input, candidate) {
  const a = normalizeName(input);
  const b = normalizeName(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  const aWords = a.split(' ');
  const bWords = b.split(' ');
  if (aWords.length >= 2 && bWords.length >= 2) {
    const aLast = aWords[aWords.length - 1];
    const bLast = bWords[bWords.length - 1];
    if (aLast === bLast && aWords[0].charAt(0) === bWords[0].charAt(0)) return true;
  }
  return false;
}

function isTruthy(v) {
  if (v === true) return true;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'x' || s === 'invited';
}

function handleLookup(name) {
  if (!name || !String(name).trim()) return { found: false };
  const sheet = getSheet();
  const headers = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const primary = row[headers.primary_name];
    const secondary = row[headers.secondary_name];
    if (namesMatch(name, primary) || namesMatch(name, secondary)) {
      const submittedAt = row[headers.submitted_at];
      return {
        found: true,
        rowIndex: i + 1,
        primary: String(primary || '').trim(),
        secondary: secondary ? String(secondary).trim() : null,
        welcomeInvited: isTruthy(row[headers.welcome_invited]),
        alreadySubmitted: !!submittedAt,
      };
    }
  }
  return { found: false };
}

function handleSubmit(payload) {
  const sheet = getSheet();
  const headers = getHeaderMap(sheet);
  const rowIndex = Number(payload.rowIndex);
  if (!rowIndex || rowIndex < 2) return { success: false, error: 'Invalid row.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const submittedCol = headers.submitted_at + 1;
    const existing = sheet.getRange(rowIndex, submittedCol).getValue();
    if (existing) return { success: false, alreadySubmitted: true };

    const primary = sheet.getRange(rowIndex, headers.primary_name + 1).getValue();
    if (payload.primaryName && normalizeName(payload.primaryName) !== normalizeName(primary)) {
      return { success: false, error: 'Row mismatch.' };
    }

    const r = payload.responses || {};
    writeCell(sheet, rowIndex, headers.reception_primary, r.receptionPrimary);
    writeCell(sheet, rowIndex, headers.reception_secondary, r.receptionSecondary);
    writeCell(sheet, rowIndex, headers.welcome_primary, r.welcomePrimary);
    writeCell(sheet, rowIndex, headers.welcome_secondary, r.welcomeSecondary);
    writeCell(sheet, rowIndex, headers.brunch_primary, r.brunchPrimary);
    writeCell(sheet, rowIndex, headers.brunch_secondary, r.brunchSecondary);
    writeCell(sheet, rowIndex, headers.note, payload.note || '');
    sheet.getRange(rowIndex, submittedCol).setValue(new Date());

    sendNotification(sheet, rowIndex, headers, payload);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function writeCell(sheet, rowIndex, colIndex, value) {
  const cellValue = value === null || value === undefined ? '' : value;
  sheet.getRange(rowIndex, colIndex + 1).setValue(cellValue);
}

function sendNotification(sheet, rowIndex, headers, payload) {
  try {
    const primary = String(sheet.getRange(rowIndex, headers.primary_name + 1).getValue() || '').trim();
    const secondary = String(sheet.getRange(rowIndex, headers.secondary_name + 1).getValue() || '').trim();
    const r = payload.responses || {};

    const lines = [];
    lines.push('New RSVP received.');
    lines.push('');
    lines.push('Household: ' + primary + (secondary ? ' & ' + secondary : ''));
    lines.push('Row: ' + rowIndex);
    lines.push('');
    lines.push('The Wedding:');
    lines.push('  ' + primary + ': ' + (r.receptionPrimary || '-'));
    if (secondary) lines.push('  ' + secondary + ': ' + (r.receptionSecondary || '-'));
    lines.push('');
    lines.push('Welcome Drinks:');
    lines.push('  ' + primary + ': ' + (r.welcomePrimary || '-'));
    if (secondary) lines.push('  ' + secondary + ': ' + (r.welcomeSecondary || '-'));
    lines.push('');
    lines.push('Brunch & Bowling:');
    lines.push('  ' + primary + ': ' + (r.brunchPrimary || '-'));
    if (secondary) lines.push('  ' + secondary + ': ' + (r.brunchSecondary || '-'));
    if (payload.note) {
      lines.push('');
      lines.push('Note:');
      lines.push(payload.note);
    }

    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: 'RSVP: ' + primary + (secondary ? ' & ' + secondary : ''),
      body: lines.join('\n'),
    });
  } catch (err) {
    console.error('Notification email failed: ' + err);
  }
}
