function checkExpectedFunctions() {
  const expected = [
    'backupSpreadsheet',
    'fixCommonNamesGeneric',
    'ensureHeaderAliases',
    'populateTitleDisplayAndShort_Generic',
    'forceOverwriteTitleEn_WithProtectionHandling_Generic',
    'forceRewriteAltTextEn_Targeted_Generic',
    'applyDataValidationRules_Generic',
    'addHiddenOpsFlagAndHideCols_Generic',
    'runSmokeTest_Generic',
    'runRefreshAutosSandbox',
    'runRefreshAutosForSheet',
    'refreshActiveTab',
    'onOpen',
    'checkExpectedFunctions'
  ];

  const present = [];
  const missing = [];
  expected.forEach(fn => {
    try { (typeof this[fn] === 'function') ? present.push(fn) : missing.push(fn); }
    catch(e){ missing.push(fn); }
  });

  const ss = SpreadsheetApp.getActive();
  const name = 'QA_Report_Functions';
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.appendRow(['function','status']);
  present.forEach(f => sh.appendRow([f,'present']));
  missing.forEach(f => sh.appendRow([f,'MISSING']));
  SpreadsheetApp.getUi().alert('Function scan complete. See sheet: ' + name);
}

