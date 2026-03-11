/** Helpers restore bundle
 * Drop into Apps Script as a single file. Implements:
 * - backupSpreadsheet
 * - fixCommonNamesGeneric
 * - ensureHeaderAliases
 * - populateTitleDisplayAndShort_Generic
 * - forceOverwriteTitleEn_WithProtectionHandling_Generic
 * - forceRewriteAltTextEn_Targeted_Generic
 * - applyDataValidationRules_Generic
 * - addHiddenOpsFlagAndHideCols_Generic
 * - runSmokeTest_Generic
 * - runRefreshAutosSandbox
 * - runRefreshAutosForSheet
 *
 * Safe defaults: operate on sheetName argument; if omitted use active sheet.
 */

const MAX_TITLE_EN = 60;
const DEFAULT_SKIP_PREFIXES = ['QA_Report','Backup','Control_GHM'];

/* ---------- 1) backupSpreadsheet ---------- */
function backupSpreadsheet() {
  const ss = SpreadsheetApp.getActive();
  const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmmss');
  const copyName = ss.getName() + '_Backup_' + now;
  ss.copy(copyName);
  return copyName;
}

/* ---------- 2) fixCommonNamesGeneric ---------- */
function fixCommonNamesGeneric(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const idxChar = headers.indexOf('Character');
  const idxNameFinal = headers.indexOf('name_final');
  const map = {'Posiedon':'Poseidon','posiedon':'Poseidon','Posiedon.':'Poseidon.','HADES':'Hades','hades':'Hades'};

  const rows = sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),sh.getLastColumn()).getValues();
  const updates = [];
  for (let r=0;r<rows.length;r++){
    const rowNum = r+2;
    if (idxChar >= 0 && rows[r][idxChar]) {
      const cur = String(rows[r][idxChar]);
      if (map[cur]) {
        sh.getRange(rowNum, idxChar+1).setValue(map[cur]);
        updates.push([rowNum,'Character',cur,map[cur]]);
      }
    }
    if (idxNameFinal >= 0 && rows[r][idxNameFinal]) {
      let cur2 = String(rows[r][idxNameFinal]);
      let replaced = cur2;
      Object.keys(map).forEach(k => { replaced = replaced.replace(new RegExp('\\b'+k+'\\b','g'), map[k]); });
      if (replaced !== cur2) {
        sh.getRange(rowNum, idxNameFinal+1).setValue(replaced);
        updates.push([rowNum,'name_final',cur2,replaced]);
      }
    }
  }
  if (updates.length) {
    const rep = ss.getSheetByName('QA_Report_NameMapping') || ss.insertSheet('QA_Report_NameMapping');
    rep.clear(); rep.appendRow(['row','field','old','new']);
    rep.getRange(2,1,updates.length,updates[0].length).setValues(updates);
  }
}

/* ---------- 3) ensureHeaderAliases ---------- */
function ensureHeaderAliases(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const hasColorway = headers.indexOf('Colorway') >= 0;
  const hasColourway = headers.indexOf('Colourway') >= 0;
  if (hasColorway && !hasColourway) {
    const col = headers.indexOf('Colorway') + 1;
    const lastCol = sh.getLastColumn();
    sh.insertColumnAfter(lastCol);
    sh.getRange(1, lastCol+1).setValue('Colourway');
    // copy values by formula referencing Colorway column
    const offset = col - (lastCol+1);
    const rows = Math.max(1, sh.getLastRow()-1);
    if (rows > 0) sh.getRange(2, lastCol+1, rows).setFormulaR1C1('=IF(RC[' + offset + ']="","",RC[' + offset + '])');
  }
}

/* ---------- 4) populateTitleDisplayAndShort_Generic ---------- */
function populateTitleDisplayAndShort_Generic(sheetName, overwriteTitleEn) {
  const ss = SpreadsheetApp.getActive();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  // backup sheet copy
  const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmm');
  sh.copyTo(ss).setName(sh.getName() + '_Backup_' + now);

  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const idx = h => headers.indexOf(h);
  const H = {
    Series: idx('Series'),
    Character: idx('Character'),
    Variant: idx('Character_Variant'),
    myth_scene: idx('myth_scene'),
    Style: idx('Style'),
    Colourway: idx('Colourway') >=0 ? idx('Colourway') : (idx('Colorway')>=0? idx('Colorway') : -1),
    Frame: idx('Frame'),
    title_display: idx('title_display'),
    title_en: idx('title_en'),
    name_final: idx('name_final'),
    slug: idx('slug')
  };

  // ensure title_display/title_en exist
  let colCount = headers.length;
  if (H.title_display === -1) { colCount++; sh.getRange(1,colCount).setValue('title_display'); H.title_display = colCount-1; headers.push('title_display'); }
  if (H.title_en === -1) { colCount++; sh.getRange(1,colCount).setValue('title_en'); H.title_en = colCount-1; headers.push('title_en'); }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const data = sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues();
  const changes = [];

  function cleanText(s){ return s === null || s === undefined ? '' : String(s).replace(/\s+/g,' ').trim(); }
  function makeShortMythFragment(baseLen, mythScene){
    if (!mythScene) return '';
    mythScene = cleanText(mythScene);
    const maxRem = MAX_TITLE_EN - baseLen - 3;
    if (maxRem <= 0) return '';
    const words = mythScene.split(/\s+/);
    let frag='';
    for (let i=0;i<words.length;i++){
      const candidate = (frag?frag+' ':'') + words[i];
      if (candidate.length > maxRem) break;
      frag = candidate;
    }
    if (!frag) frag = mythScene.substring(0,Math.max(0,maxRem)).trim();
    return frag;
  }

  for (let i=0;i<data.length;i++){
    const rowNum = i+2;
    const row = data[i];

    const Series = cleanText(H.Series>=0? row[H.Series] : '');
    const Character = cleanText(H.Character>=0? row[H.Character] : '');
    const Variant = cleanText(H.Variant>=0? row[H.Variant] : '');
    const myth = cleanText(H.myth_scene>=0? row[H.myth_scene] : '');
    const Style = cleanText(H.Style>=0? row[H.Style] : '');
    const Colourway = cleanText(H.Colourway>=0? row[H.Colourway] : '');
    const Frame = cleanText(H.Frame>=0? row[H.Frame] : '');

    const charParts = [Character, Variant].filter(Boolean).join(' ');
    const middle = [charParts, myth].filter(Boolean).join(' ').trim();
    const segments = [];
    if (Series) segments.push(Series);
    if (middle) segments.push(middle);
    if (Style) segments.push(Style);
    if (Colourway) segments.push(Colourway);
    if (Frame) segments.push(Frame);
    const display = segments.join(' | ').trim();

    const oldDisplay = row[H.title_display] || '';
    if (String(oldDisplay).trim() !== display) {
      sh.getRange(rowNum, H.title_display+1).setValue(display);
      changes.push([rowNum, 'title_display', oldDisplay, display]);
    }

    // build short title_en
    let base = Character || '';
    if (Variant) base = base ? (base + ' — ' + Variant) : Variant;
    if (!base) {
      const nf = cleanText(H.name_final>=0? row[H.name_final] : '');
      const slug = cleanText(H.slug>=0? row[H.slug] : '');
      base = nf || slug || '';
    }
    let candidate = base;
    if (myth && base) {
      const frag = makeShortMythFragment(base.length, myth);
      if (frag) candidate = base + ' (' + frag + ')';
    }
    if (candidate.length > MAX_TITLE_EN) candidate = candidate.substring(0, MAX_TITLE_EN).trim();

    const oldShort = row[H.title_en] || '';
    if ((overwriteTitleEn || !oldShort || String(oldShort).trim() === '') && String(oldShort).trim() !== candidate) {
      sh.getRange(rowNum, H.title_en+1).setValue(candidate);
      changes.push([rowNum, 'title_en', oldShort, candidate]);
    }
  }

  // QA sheet
  const REP = 'QA_Report_TitleUpdates';
  let rep = ss.getSheetByName(REP) || ss.insertSheet(REP);
  rep.clear();
  if (changes.length) {
    rep.appendRow(['row','field','old','new']);
    rep.getRange(2,1,changes.length,changes[0].length).setValues(changes);
  } else rep.appendRow(['no_changes']);
}

/* ---------- 5) protection-aware force overwrite title ---------- */
function forceOverwriteTitleEn_WithProtectionHandling_Generic(sheetName) {
  const SS = SpreadsheetApp.getActive();
  const sh = sheetName ? SS.getSheetByName(sheetName) : SS.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);

  // backup
  const now = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmm');
  sh.copyTo(SS).setName(sh.getName() + '_Backup_TitleForce_' + now);

  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const idx = h => headers.indexOf(h);
  const H = {
    Character: idx('Character'),
    Variant: idx('Character_Variant'),
    myth: idx('myth_scene'),
    name_final: idx('name_final'),
    slug: idx('slug'),
    title_en: idx('title_en')
  };
  if (H.title_en < 0) throw new Error('Header "title_en" not found on ' + sheetName);

  // capture protections
  const saved = [];
  const protections = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).concat(sh.getProtections(SpreadsheetApp.ProtectionType.SHEET));
  protections.forEach(function(p){
    try {
      const a1 = p.getRange() ? p.getRange().getA1Notation() : null;
      let affects = false;
      if (!a1) affects = true;
      else {
        const rng = sh.getRange(a1);
        const c1 = rng.getColumn();
        const c2 = c1 + rng.getNumColumns() - 1;
        const titleCol = H.title_en + 1;
        if (titleCol >= c1 && titleCol <= c2) affects = true;
      }
      if (affects) saved.push(p);
    } catch(e){ Logger.log('prot capture error: '+e); }
  });

  // remove protections we can
  const removed = [];
  saved.forEach(function(p){ try { p.remove(); removed.push(true); } catch(e){ Logger.log('remove prot err: '+e.message); } });

  // write titles
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  const rows = sh.getRange(2,1,lastRow-1,sh.getLastColumn()).getValues();
  const out = [];

  function clean(s){ return s === null || s === undefined ? '' : String(s).replace(/\s+/g,' ').trim(); }
  function makeShortMythFragment(baseLen, mythScene){
    if (!mythScene) return '';
    mythScene = clean(mythScene);
    const maxRem = MAX_TITLE_EN - baseLen - 3;
    if (maxRem <= 0) return '';
    const words = mythScene.split(/\s+/);
    let frag='';
    for (let i=0;i<words.length;i++){
      const candidate = (frag?frag+' ':'') + words[i];
      if (candidate.length > maxRem) break;
      frag = candidate;
    }
    if (!frag) frag = mythScene.substring(0,Math.max(0,maxRem)).trim();
    return frag;
  }

  for (let r=0;r<rows.length;r++){
    const rowNum = r+2;
    const row = rows[r];
    const Character = clean(H.Character>=0? row[H.Character] : '');
    const Variant = clean(H.Variant>=0? row[H.Variant] : '');
    const myth = clean(H.myth>=0? row[H.myth] : '');
    let base = Character || '';
    if (Variant) base = base ? (base + ' — ' + Variant) : Variant;
    if (!base) {
      const nf = clean(H.name_final>=0? row[H.name_final] : '');
      const slug = clean(H.slug>=0? row[H.slug] : '');
      base = nf || slug || '';
    }
    let candidate = base;
    if (myth && base) {
      const frag = makeShortMythFragment(base.length, myth);
      if (frag) candidate = base + ' (' + frag + ')';
    }
    if (candidate.length > MAX_TITLE_EN) candidate = candidate.substring(0, MAX_TITLE_EN).trim();
    try {
      sh.getRange(rowNum, H.title_en + 1).setValue(candidate);
      out.push([rowNum, candidate, 'ok']);
    } catch(e) {
      out.push([rowNum, candidate, 'ERROR: ' + e.message]);
    }
  }

  // restore protections (best effort)
  saved.forEach(function(p){
    try {
      if (p.getRange()) {
        const a1 = p.getRange().getA1Notation();
        sh.getRange(a1).protect();
      } else {
        sh.protect();
      }
    } catch(e){ Logger.log('restore prot err: ' + e.message); }
  });

  const REP = 'QA_Report_TitleForce';
  let rep = SS.getSheetByName(REP) || SS.insertSheet(REP);
  rep.clear();
  rep.appendRow(['row','new_title_en','status']);
  if (out.length) rep.getRange(2,1,out.length,out[0].length).setValues(out);
}

/* ---------- 6) forceRewriteAltTextEn_Targeted_Generic ---------- */
function forceRewriteAltTextEn_Targeted_Generic(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);

  // backup
  const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmm');
  sh.copyTo(ss).setName(sh.getName() + '_Backup_ALTforce_' + now);

  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const H = {
    alt: headers.indexOf('alt_text_en'),
    title: headers.indexOf('title_en'),
    myth: headers.indexOf('myth_scene'),
    meaning: headers.indexOf('meaning_line'),
    color: headers.indexOf('Colorway') >= 0 ? headers.indexOf('Colorway') : headers.indexOf('Colourway'),
    character: headers.indexOf('Character'),
    name_final: headers.indexOf('name_final')
  };
  if (H.alt < 0) throw new Error('alt_text_en header not found on ' + sheetName);

  const rows = sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),sh.getLastColumn()).getValues();
  const report = [];
  const MAX_ALT = 125;

  for (let r=0;r<rows.length;r++){
    const rowNum = r+2;
    const row = rows[r];

    let base = H.title>=0 && row[H.title] ? String(row[H.title]).trim() : '';
    if (!base && H.name_final>=0 && row[H.name_final]) base = String(row[H.name_final]).trim();
    if (!base && H.character>=0 && row[H.character]) base = String(row[H.character]).trim();
    base = base.replace(/\s*\([^)]*\)/g,'').trim();

    const descPieces = [];
    if (H.myth >= 0 && row[H.myth]) descPieces.push(String(row[H.myth]).trim());
    if (H.meaning >= 0 && row[H.meaning]) descPieces.push(String(row[H.meaning]).trim());
    if (H.color >= 0 && row[H.color]) descPieces.push(String(row[H.color]).trim());
    const cleanDescs = descPieces.map(d => String(d).replace(/\s*\([^)]*\)/g,'').replace(/palette\s*[:\-]\s*/i,'').trim()).filter(Boolean).slice(0,3);
    let desc = cleanDescs.join(', ');
    let newAlt = base || '';
    if (desc) newAlt = (newAlt ? newAlt + '. ' : '') + desc + '.';
    if (!newAlt) newAlt = 'Artwork image.';
    if (newAlt.length > MAX_ALT) newAlt = newAlt.substring(0, MAX_ALT).trim();

    try {
      sh.getRange(rowNum, H.alt+1).setValue(newAlt);
      report.push([rowNum, newAlt, 'ok']);
    } catch(e) {
      report.push([rowNum, newAlt, 'ERROR: ' + e.message]);
    }
  }

  const RN = 'QA_Report_AltForce';
  let rep = ss.getSheetByName(RN) || ss.insertSheet(RN);
  rep.clear();
  rep.appendRow(['row','new_alt','status']);
  if (report.length) rep.getRange(2,1,report.length,report[0].length).setValues(report);
}

/* ---------- 7) applyDataValidationRules_Generic ---------- */
function applyDataValidationRules_Generic(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const headerIndex = name => headers.indexOf(name);
  const tierCol = headerIndex('Tier');
  const langCol = headerIndex('Planned_Langs');
  const hexCol = headerIndex('background_hex');

  const tiers = ['Mythic Icon','Signature Edition','Companion Piece','Limited Edition Print','Relic'];
  if (tierCol >= 0) {
    const range = sh.getRange(2, tierCol+1, sh.getMaxRows()-1);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(tiers, true).setAllowInvalid(false).setHelpText('Pick a Tier').build();
    range.setDataValidation(rule);
  }

  const langs = ['en','ja','hi','it','zh-Hans'];
  if (langCol >= 0) {
    const range = sh.getRange(2, langCol+1, sh.getMaxRows()-1);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(langs, true).setAllowInvalid(true).setHelpText('Use planned lang codes').build();
    range.setDataValidation(rule);
  }

  if (hexCol >= 0) {
    const colLetter = columnToLetter(hexCol+1);
    const formula = `=OR(ISBLANK(${colLetter}2),REGEXMATCH(${colLetter}2,"^#([A-Fa-f0-9]{6})$"))`;
    const range = sh.getRange(2, hexCol+1, sh.getMaxRows()-1);
    const rule = SpreadsheetApp.newDataValidation().requireFormulaSatisfied(formula).setAllowInvalid(false).setHelpText('Must be #RRGGBB or blank').build();
    range.setDataValidation(rule);
  }
}

/* ---------- 8) addHiddenOpsFlagAndHideCols_Generic ---------- */
function addHiddenOpsFlagAndHideCols_Generic(sheetName) {
  const ss = SpreadsheetApp.getActive();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];

  const HIDDEN_COLUMNS = [
    'Renders','Thumbnails','cid_Previews','cid_Renders','cid_Thumbnails',
    'image_path','json_path','json_cid','unlockable_path','cid_master','cid_video','cid_vr','cid_coa','cid_print_token'
  ];

  let flagIndex = headers.indexOf('HIDDEN_OPS');
  if (flagIndex === -1) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue('HIDDEN_OPS');
    flagIndex = sh.getLastColumn()-1;
  }

  headers.forEach(function(name, i){
    if (HIDDEN_COLUMNS.indexOf(name) !== -1) {
      try { sh.hideColumns(i+1); } catch(e) { Logger.log('hide col err: ' + e); }
    }
  });

  sh.getRange(1, flagIndex+1).setValue('HIDDEN_OPS - columns hidden');
}

/* ---------- 9) runSmokeTest_Generic ---------- */
function runSmokeTest_Generic(sheetName, N) {
  N = N || 10;
  const ss = SpreadsheetApp.getActive();
  const sh = sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const H = {
    name_final: headers.indexOf('name_final'),
    slug: headers.indexOf('slug'),
    title_en: headers.indexOf('title_en'),
    alt_text_en: headers.indexOf('alt_text_en'),
    license_url: headers.indexOf('license_url'),
    background_hex: headers.indexOf('background_hex'),
    image_cid: headers.indexOf('image_cid'),
    image_url: headers.indexOf('image_url')
  };

  const last = Math.min(N, Math.max(0, sh.getLastRow()-1));
  const rows = sh.getRange(2,1,last,sh.getLastColumn()).getValues();
  const repName = 'QA_Report';
  let rep = ss.getSheetByName(repName) || ss.insertSheet(repName);
  rep.clear();
  rep.appendRow(['row','issue','field','value','notes']);
  rows.forEach(function(r, idx){
    const rowNum = idx + 2;
    const name = r[H.name_final] || '';
    if (name.length > 60) rep.appendRow([rowNum,'length','name_final',name,'>60 chars']);
    const slug = r[H.slug] || '';
    if (slug.length > 120) rep.appendRow([rowNum,'length','slug',slug,'>120 chars']);
    const title = r[H.title_en] || '';
    if (!title) rep.appendRow([rowNum,'missing','title_en',title,'required']);
    const alt = r[H.alt_text_en] || '';
    if (!alt) rep.appendRow([rowNum,'missing','alt_text_en',alt,'recommended']);
    if (alt.length > 125) rep.appendRow([rowNum,'length','alt_text_en',alt,'>125 chars']);
    const lic = r[H.license_url] || '';
    const hex = r[H.background_hex] || '';
    if (!lic) rep.appendRow([rowNum,'missing','license_url',lic,'JSON gate fails']);
    if (hex && !/^#([A-Fa-f0-9]{6})$/.test(hex)) rep.appendRow([rowNum,'format','background_hex',hex,'invalid pattern']);
    const cid = r[H.image_cid] || '';
    const url = r[H.image_url] || '';
    if (!cid && !url) rep.appendRow([rowNum,'missing','image_cid/image_url','', 'no media reference']);
  });

  SpreadsheetApp.getUi().alert('Smoke test done. See sheet: ' + repName);
}

/* ---------- 10) runRefreshAutosSandbox ---------- */
function runRefreshAutosSandbox() {
  const ss = SpreadsheetApp.getActive();
  const sheets = ss.getSheets().map(s => s.getName());
  for (let i=0;i<sheets.length;i++){
    const name = sheets[i];
    // skip QA and backups and Control
    if (DEFAULT_SKIP_PREFIXES.some(p => name.indexOf(p) === 0)) continue;
    try {
      runRefreshAutosForSheet(name);
    } catch(e) {
      Logger.log('runRefreshAutosSandbox error on ' + name + ': ' + e.message);
    }
  }
  SpreadsheetApp.getUi().alert('Refresh All (Sandbox) complete. Check QA_Report sheets.');
}

/* ---------- 11) runRefreshAutosForSheet ---------- */
function runRefreshAutosForSheet(sheetName) {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(sheetName)) throw new Error('Sheet not found: ' + sheetName);
  // backup single sheet
  const sh = ss.getSheetByName(sheetName);
  const now = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyyMMdd_HHmm');
  sh.copyTo(ss).setName(sheetName + '_Backup_' + now);

  try { fixCommonNamesGeneric(sheetName); } catch(e){ Logger.log('fixCommonNames error: '+e.message); }
  try { ensureHeaderAliases(sheetName); } catch(e){ Logger.log('ensureHeaderAliases error: '+e.message); }
  try { populateTitleDisplayAndShort_Generic(sheetName, true); } catch(e){ Logger.log('populateTitleDisplay error: '+e.message); }
  try { forceOverwriteTitleEn_WithProtectionHandling_Generic(sheetName); } catch(e){ Logger.log('forceTitleEn error: '+e.message); }
  try { forceRewriteAltTextEn_Targeted_Generic(sheetName); } catch(e){ Logger.log('forceAlt error: '+e.message); }
  try { applyDataValidationRules_Generic(sheetName); } catch(e){ Logger.log('applyDataValidationRules error: '+e.message); }
  try { addHiddenOpsFlagAndHideCols_Generic(sheetName); } catch(e){ Logger.log('hideOps error: '+e.message); }
  try { runSmokeTest_Generic(sheetName, 20); } catch(e){ Logger.log('smokeTest error: '+e.message); }

  SpreadsheetApp.getUi().alert('Refresh complete for: ' + sheetName + '. Check QA_Report sheets for details.');
}

/* ---------- util: columnToLetter ---------- */
function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

