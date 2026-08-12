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

function logEvent(level, event, details) {
  const entry = JSON.stringify(Object.assign({ event: event, at: new Date().toISOString() }, details || {}));
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

function doPost(e) {
  let action = 'unknown';
  try {
    const payload = JSON.parse(e.postData.contents);
    action = payload.action;
    if (action === 'lookup') return jsonResponse(handleLookup(payload.name));
    if (action === 'submit') return jsonResponse(handleSubmit(payload));
    logEvent('error', 'unknown_action', { action: action });
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    logEvent('error', 'request_failed', {
      action: action,
      error: String(err && err.message || err),
      stack: String(err && err.stack || ''),
    });
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

function namesMatchExact(input, candidate) {
  const a = normalizeName(input);
  const b = normalizeName(candidate);
  return !!a && !!b && a === b;
}

function firstNamesCompatible(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.indexOf(b) === 0 || b.indexOf(a) === 0;
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
    if (aLast === bLast && firstNamesCompatible(aWords[0], bWords[0])) return true;
  }
  return false;
}

function isTruthy(v) {
  if (v === true) return true;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 'x' || s === 'invited';
}

function findMatches(data, headers, name, matcher) {
  const matches = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const primary = row[headers.primary_name];
    const secondary = row[headers.secondary_name];
    if (matcher(name, primary)) {
      matches.push({ index: i, field: 'primary', matchedName: String(primary || '').trim() });
    } else if (matcher(name, secondary)) {
      matches.push({ index: i, field: 'secondary', matchedName: String(secondary || '').trim() });
    }
  }
  return matches;
}

function handleLookup(name) {
  if (!name || !String(name).trim()) {
    logEvent('warn', 'lookup_failed', { reason: 'empty_name' });
    return { found: false };
  }
  const sheet = getSheet();
  const headers = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const searched = String(name).trim();

  let matchType = 'exact';
  let matches = findMatches(data, headers, name, namesMatchExact);
  if (matches.length === 0) {
    matchType = 'fuzzy';
    matches = findMatches(data, headers, name, namesMatch);
  }

  if (matches.length === 0) {
    logEvent('warn', 'lookup_failed', { reason: 'not_found', searched: searched });
    return { found: false };
  }

  if (matches.length > 1) {
    logEvent('warn', 'lookup_ambiguous', {
      searched: searched,
      matchType: matchType,
      candidates: matches.map(m => m.matchedName + ' (row ' + (m.index + 1) + ')'),
    });
    return { found: false, ambiguous: true };
  }

  const match = matches[0];
  const row = data[match.index];
  const primary = row[headers.primary_name];
  const secondary = row[headers.secondary_name];
  const result = {
    found: true,
    rowIndex: match.index + 1,
    primary: String(primary || '').trim(),
    secondary: secondary ? String(secondary).trim() : null,
    welcomeInvited: isTruthy(row[headers.welcome_invited]),
    alreadySubmitted: !!row[headers.submitted_at],
  };
  logEvent('info', 'lookup_success', {
    searched: searched,
    matchType: matchType,
    matchedField: match.field,
    matchedName: match.matchedName,
    household: result.primary + (result.secondary ? ' & ' + result.secondary : ''),
    rowIndex: result.rowIndex,
    alreadySubmitted: result.alreadySubmitted,
  });
  return result;
}

function handleSubmit(payload) {
  const sheet = getSheet();
  const headers = getHeaderMap(sheet);
  const rowIndex = Number(payload.rowIndex);
  if (!rowIndex || rowIndex < 2) {
    logEvent('error', 'submit_failed', {
      reason: 'invalid_row',
      rowIndex: payload.rowIndex,
      primaryName: payload.primaryName || '',
    });
    return { success: false, error: 'Invalid row.' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const submittedCol = headers.submitted_at + 1;
    const existing = sheet.getRange(rowIndex, submittedCol).getValue();
    if (existing) {
      logEvent('warn', 'submit_failed', {
        reason: 'already_submitted',
        rowIndex: rowIndex,
        primaryName: payload.primaryName || '',
      });
      return { success: false, alreadySubmitted: true };
    }

    const primary = sheet.getRange(rowIndex, headers.primary_name + 1).getValue();
    if (payload.primaryName && normalizeName(payload.primaryName) !== normalizeName(primary)) {
      logEvent('error', 'submit_failed', {
        reason: 'row_mismatch',
        rowIndex: rowIndex,
        primaryName: payload.primaryName,
        sheetName: String(primary || '').trim(),
      });
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

    logEvent('info', 'submit_success', {
      rowIndex: rowIndex,
      primaryName: String(primary || '').trim(),
      responses: r,
      hasNote: !!payload.note,
    });

    sendNotification(sheet, rowIndex, headers, payload);
    return { success: true };
  } catch (err) {
    logEvent('error', 'submit_failed', {
      reason: 'exception',
      rowIndex: rowIndex,
      primaryName: payload.primaryName || '',
      error: String(err && err.message || err),
      stack: String(err && err.stack || ''),
    });
    throw err;
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
    logEvent('error', 'notification_failed', {
      rowIndex: rowIndex,
      error: String(err && err.message || err),
    });
  }
}
