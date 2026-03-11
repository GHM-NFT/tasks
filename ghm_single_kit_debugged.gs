/*************************************************
 * GHM — SINGLE KIT (debugged hardening pass)
 * Notes:
 * - Keeps one onOpen menu entrypoint.
 * - Uses bulk reads for compact views (faster, fewer API calls).
 * - Handles header aliases and safer control autofill.
 **************************************************/

var GHM_FONT = "Roboto Condensed";
var GHM_HEADER_BG = "#1f2937";
var GHM_HEADER_FG = "#ffffff";

var GHM_EXCLUDE_TABS = new Set([
  "All","Collections_Index","Characters_Index","Series_Character_Matrix","Traits_Dictionary",
  "TOC","Control","Control_GHM","Globals","_GHM_LISTS_","Taxonomy_Categories","Taxonomy_Mapping",
  "_GHM_DEBUG_","_GHM_BU_AUDIT_","GHM_CONTROL_APPLY_REPORT",
  "Compact_View","Metadata_QC","Marketplace_Preview","ERC1155 - Editions"
]);

// Fields expected to be filled from Control (blue/admin-once columns).
var GHM_CONTROL_TO_MANIFEST = [
  {setting:"royalty_bps_default", aliases:["royalty_bps"]},
  {setting:"fee_recipient_default", aliases:["fee_recipient","royalty_recipient"]},
  {setting:"reveal_mode_default", aliases:["reveal_mode"]},
  {setting:"reveal_date_default", aliases:["reveal_date"]},
  {setting:"freeze_policy_default", aliases:["freeze_policy"]},
  {setting:"freeze_date_default", aliases:["freeze_date"]},
  {setting:"primary_mint_platform_default", aliases:["primary_mint_platform"]},
  {setting:"est_gas_mint_default", aliases:["est_gas_mint"]},
  {setting:"est_gas_batch_default", aliases:["est_gas_batch"]}
];

var GHM_NORM = function(s){
  return (s||"").toString().trim().toLowerCase().replace(/\s*\/\s*/g,"/").replace(/\s+/g," ");
};

function GHM_headerMap(sh){
  var c = sh.getLastColumn();
  if (c < 1) return {raw:[], map:{}};
  var raw = sh.getRange(1,1,1,c).getValues()[0];
  var map = {};
  raw.forEach(function(h,i){
    var k = GHM_NORM(h);
    if (k && !(k in map)) map[k] = i+1;
  });
  return {raw:raw, map:map};
}

function GHM_bodyRows(sh){ return Math.max(0, sh.getLastRow()-1); }

function GHM_ensureCol(sh, label){
  var m = GHM_headerMap(sh).map;
  var c = m[GHM_NORM(label)];
  if (!c){ c = sh.getLastColumn()+1; sh.getRange(1,c).setValue(label); }
  return c;
}

function GHM_firstCol(sh, aliases){
  var map = GHM_headerMap(sh).map;
  for (var i=0;i<aliases.length;i++){
    var c = map[GHM_NORM(aliases[i])];
    if (c) return c;
  }
  return 0;
}

function BuildAllMenusNow(){
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("GHM")
    .addSubMenu(ui.createMenu("Control")
      .addItem("Setup Control","Control_Setup")
      .addItem("Apply Control to Tabs (safe)","Control_Apply_Safe"))
    .addSubMenu(ui.createMenu("Views")
      .addItem("Compact (Active Tab — HARD)","View_Compact_Active_HARD")
      .addItem("Compact (ALL — HARD)","View_Compact_All_HARD")
      .addItem("Clean Compact Aliases","View_Compact_Cleanup"))
    .addSubMenu(ui.createMenu("Color")
      .addItem("Repaint This Tab (columns)","Color_Repaint_ThisTab"))
    .addSubMenu(ui.createMenu("Maintenance")
      .addItem("Sanitize Text Columns","Fix_Sanitize_TextColumns")
      .addItem("Fix Standard/Contract (all tabs)","Fix_Standard_Contract_All")
      .addItem("Dedup ‘contract_factory’","Fix_DedupeHeader_ContractFactory")
      .addItem("Run derivations (if available)","Run_Derivations_IfAvailable")
      .addItem("Rebuild Control Report","Control_Rebuild_Report"))
    .addToUi();
}

function onOpen(){
  BuildAllMenusNow();
  try { if (typeof BuildGhmAutosMenu_ === 'function') BuildGhmAutosMenu_(); } catch (e) {}
}

function GHM_safeSetValues_(rng, values){
  try {
    rng.setValues(values);
    return true;
  } catch (e1) {
    try {
      rng.clearDataValidations();
      SpreadsheetApp.flush();
      rng.setValues(values);
      return true;
    } catch (e2) {
      throw new Error('safeSetValues failed at ' + rng.getA1Notation() + ' on sheet ' + rng.getSheet().getName() + ': ' + e2.message);
    }
  }
}


function GHM_getControlSheet_(ss){
  return ss.getSheetByName("Control") || ss.getSheetByName("Control_GHM");
}

function GHM_readControlValues_(sh){
  var out = {};
  if (!sh || sh.getLastRow() < 2 || sh.getLastColumn() < 2) return out;
  var rows = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  rows.forEach(function(r){
    var k = String(r[0] || '').trim();
    if (!k) return;
    out[k] = r[1];
  });
  return out;
}

function Control_Setup(){
  var ss = SpreadsheetApp.getActive();
  var rows = [
    ["Setting","Value","Notes"],
    ["project_name","GHM – Mythic Icons","Display only"],
    ["default_locale","en","JSON language (on-chain)"],
    ["secondary_languages","zh-Hans","Secondaries: zh-Hans,el,ja"],
    ["onchain_lang","en","On-chain = English (web localized)"],
    ["external_url_base","https://ghm.art/nft","Base for external_url"],
    ["operator_filter_default","on","on/off"],
    ["operator_policy_note","Respect creator royalties; allow major marketplaces.","Short note"],
    ["freeze_after_days","7","QA window (days)"],
    ["standard_default","721","721/1155"],
    ["edition_size_default","","Optional default for editions"],
    ["contract_factory","OpenSea","Manifold/Zora/OpenSea/Custom"],
    ["collection_address","","Canonical collection address (per series if needed)"],
    ["collection_slug","","Platform slug (for URLs)"],
    ["license_url_default","","Default license URL"],
    ["background_color_default","","HEX without # (e.g. FFFFFF)"],
    ["royalty_bps_default","","e.g. 750"],
    ["fee_recipient_default","","Royalty receiver wallet"],
    ["reveal_mode_default","","e.g. delayed / instant"],
    ["reveal_date_default","","ISO date/time when delayed"],
    ["freeze_policy_default","","Policy label"],
    ["freeze_date_default","","ISO date for freeze"],
    ["primary_mint_platform_default","","e.g. OpenSea / Manifold"],
    ["est_gas_mint_default","","Estimated gas for single mint"],
    ["est_gas_batch_default","","Estimated gas for batch mint"],
    ["license_type_default","","Default license type"],
    ["terms_url_default","","Default terms URL"],
    ["physical_terms_url_default","","Default physical terms URL"],
    ["marketplace_targets_default","","Comma-separated marketplaces"],
    ["canonical_domain_or_ENS_default","","Canonical domain or ENS"],
    ["target_fiat_price_default","","Target fiat price"],
    ["price_native_default","","Price native"],
    ["license_attr_value_default","","License attr value"],
    ["schema_version_default","","Schema Version"],
  ];

  var control = ss.getSheetByName("Control");
  var existing = control ? GHM_readControlValues_(control) : {};
  if (control) control.clear(); else control = ss.insertSheet("Control");

  // Preserve existing values by key so setup is additive and non-destructive.
  for (var ri=1; ri<rows.length; ri++) {
    var key = rows[ri][0];
    if (Object.prototype.hasOwnProperty.call(existing, key) && existing[key] !== '' && existing[key] != null) {
      rows[ri][1] = existing[key];
    }
  }

  control.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  control.setFrozenRows(1);
  control.getRange(1,1,1,rows[0].length)
    .setBackground(GHM_HEADER_BG).setFontColor(GHM_HEADER_FG).setFontWeight("bold")
    .setFontFamily(GHM_FONT).setFontSize(10);
  control.getRange(2,1,rows.length-1,rows[0].length)
    .setBackground("#e5eaff").setFontFamily(GHM_FONT).setFontSize(10);

  var lst = ss.getSheetByName("_GHM_LISTS_");
  if (lst) lst.clear(); else { lst = ss.insertSheet("_GHM_LISTS_"); lst.hideSheet(); }

  var std = [["721"],["1155"]];
  var fac = [["Manifold"],["Zora"],["OpenSea"],["Custom"]];

  ["GHM_Standard_List","GHM_Factory_List"].forEach(function(n){
    var x = ss.getNamedRanges().find(function(r){ return r.getName() === n; });
    if (x) x.remove();
  });

  lst.getRange(1,1,std.length,1).setValues(std);
  lst.getRange(1,2,fac.length,1).setValues(fac);
  ss.setNamedRange("GHM_Standard_List", lst.getRange(1,1,std.length,1));
  ss.setNamedRange("GHM_Factory_List", lst.getRange(1,2,fac.length,1));
  SpreadsheetApp.getActive().toast("Control ready", "GHM", 4);
}

function Control_Apply_Safe(){
  var ss = SpreadsheetApp.getActive();
  var control = GHM_getControlSheet_(ss);
  if (!control){ SpreadsheetApp.getUi().alert("Run Control → Setup first (Control or Control_GHM)."); return; }

  var setRows = control.getDataRange().getValues();
  var S = {};
  for (var i=1;i<setRows.length;i++){
    var k = (setRows[i][0]||"").toString().trim();
    if (k) S[k] = (setRows[i][1]||"").toString().trim();
  }

  var nrStd = ss.getRangeByName("GHM_Standard_List");
  var nrFac = ss.getRangeByName("GHM_Factory_List");
  if (S.standard_default !== "721" && S.standard_default !== "1155") S.standard_default = "721";
  if (!["Manifold","Zora","OpenSea","Custom"].includes(S.contract_factory)) S.contract_factory = "OpenSea";

  var applyErrors = [];

  ss.getSheets().forEach(function(sh){
    if (GHM_EXCLUDE_TABS.has(sh.getName()) || sh.getLastColumn() < 1) return;
    var body = GHM_bodyRows(sh); if (!body) return;

    try {

    var cStd = GHM_ensureCol(sh,"standard");
    var rStd = sh.getRange(2,cStd,body,1);
    var vStd = rStd.getValues();
    for (var r=0;r<body;r++) if (!vStd[r][0]) vStd[r][0] = S.standard_default || "721";
    // Clear first, then write, otherwise strict validation can reject writes.
    rStd.clearDataValidations();
    GHM_safeSetValues_(rStd, vStd);
    if (nrStd){
      rStd.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(nrStd,true).setAllowInvalid(false).build());
    }

    var cFac = GHM_ensureCol(sh,"contract_factory");
    var rFac = sh.getRange(2,cFac,body,1);
    var vFac = rFac.getValues();
    for (var x=0;x<body;x++) if (!vFac[x][0]) vFac[x][0] = S.contract_factory || "OpenSea";
    rFac.clearDataValidations();
    GHM_safeSetValues_(rFac, vFac);
    if (nrFac){
      rFac.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(nrFac,true).setAllowInvalid(false).build());
    }

    var cOp = GHM_ensureCol(sh,"operator_filter");
    var cNote = GHM_ensureCol(sh,"operator_policy_note");
    var rOp = sh.getRange(2,cOp,body,1), rNote = sh.getRange(2,cNote,body,1);
    var vOp = rOp.getValues(), vNote = rNote.getValues();
    for (var y=0;y<body;y++){
      if (!vOp[y][0]) vOp[y][0] = S.operator_filter_default || "on";
      if (!vNote[y][0]) vNote[y][0] = S.operator_policy_note || "";
    }
    // Some tabs still carry legacy dropdown rules that reject free text like "on".
    // Clear validation first so control defaults can be applied reliably.
    rOp.clearDataValidations();
    rNote.clearDataValidations();
    GHM_safeSetValues_(rOp, vOp); GHM_safeSetValues_(rNote, vNote);

    // Fill aliases for license/background to avoid header mismatches.
    GHM_fillIfBlank_(sh, body, ["license_url","License_URL"], S.license_url_default);
    GHM_fillIfBlank_(sh, body, ["background_color"], GHM_normHexNoHash_(S.background_color_default));

    // Fill additional blue/admin-once fields from Control.
    GHM_CONTROL_TO_MANIFEST.forEach(function(f){
      GHM_fillIfBlank_(sh, body, f.aliases, S[f.setting]);
    });

    // Optional convenience derivations for commonly-empty planning columns.
    GHM_fillCollectionPathIfBlank_(sh, body);
    GHM_fillTokenRangeIfBlank_(sh, body);
    } catch (e) {
      applyErrors.push([sh.getName(), String(e.message || e)]);
    }
  });

  if (applyErrors.length){
    var rep = ss.getSheetByName('GHM_CONTROL_APPLY_ERRORS') || ss.insertSheet('GHM_CONTROL_APPLY_ERRORS');
    rep.clear();
    rep.getRange(1,1,1,2).setValues([['sheet','error']]);
    rep.getRange(2,1,applyErrors.length,2).setValues(applyErrors);
    SpreadsheetApp.getUi().alert('Control apply completed with errors. See GHM_CONTROL_APPLY_ERRORS.');
    return;
  }

  SpreadsheetApp.getActive().toast("Control applied (safe)", "GHM", 5);
}

function GHM_fillIfBlank_(sh, body, aliases, val){
  if (!val) return;
  var c = GHM_firstCol(sh, aliases);
  if (!c) c = GHM_ensureCol(sh, aliases[0]);
  var rng = sh.getRange(2,c,body,1);
  var vv = rng.getValues();
  for (var i=0;i<body;i++) if (!vv[i][0]) vv[i][0] = val;
  // Avoid validation conflicts on admin-once fields.
  rng.clearDataValidations();
  GHM_safeSetValues_(rng, vv);
}

function Run_Derivations_IfAvailable(){
  var sh = SpreadsheetApp.getActiveSheet();
  var ran = [];

  function maybeRun(fnName){
    if (typeof this[fnName] === 'function') {
      this[fnName](sh);
      ran.push(fnName);
    }
  }

  // Green fields producers from Stage_One/export scripts.
  maybeRun.call(this, 'fillAltTextEn_');
  maybeRun.call(this, 'fillTaxonomyIds_');
  maybeRun.call(this, 'fillJsonGateAndWarnings_');
  maybeRun.call(this, 'pullSoT_');
  maybeRun.call(this, 'fillSeoAutos_');

  SpreadsheetApp.getActive().toast(
    ran.length ? ('Ran: ' + ran.join(', ')) : 'No derivation functions found in project',
    'GHM',
    7
  );
}

function GHM_normHexNoHash_(v){
  var s = String(v||"").trim().replace(/^#/,"").toUpperCase();
  return /^[0-9A-F]{6}$/.test(s) ? s : "";
}

function GHM_fillCollectionPathIfBlank_(sh, body){
  var cPath = GHM_firstCol(sh,["collection_path"]); if (!cPath) return;
  var cPantheon = GHM_firstCol(sh,["Pantheon","Series"]);
  var cCharacter = GHM_firstCol(sh,["Character","Title/Name","name_final"]);
  if (!cPantheon || !cCharacter) return;

  var pathVals = sh.getRange(2,cPath,body,1).getValues();
  var panVals = sh.getRange(2,cPantheon,body,1).getValues();
  var chrVals = sh.getRange(2,cCharacter,body,1).getValues();
  var dirty = false;

  for (var i=0;i<body;i++){
    if (String(pathVals[i][0]||"").trim()) continue;
    var p = String(panVals[i][0]||"").trim();
    var c = String(chrVals[i][0]||"").trim();
    if (!p || !c) continue;
    pathVals[i][0] = "04_COLLECTIONS/" + p + "/" + c;
    dirty = true;
  }
  if (dirty){
    var rng = sh.getRange(2,cPath,body,1);
    rng.clearDataValidations();
    GHM_safeSetValues_(rng, pathVals);
  }
}

function GHM_fillTokenRangeIfBlank_(sh, body){
  var cRange = GHM_firstCol(sh,["token_range"]); if (!cRange) return;
  var cTok = GHM_firstCol(sh,["token_id"]); if (!cTok) return;

  var rangeVals = sh.getRange(2,cRange,body,1).getValues();
  var tokVals = sh.getRange(2,cTok,body,1).getValues();
  var dirty = false;

  for (var i=0;i<body;i++){
    if (String(rangeVals[i][0]||"").trim()) continue;
    var t = String(tokVals[i][0]||"").trim();
    if (!t) continue;
    rangeVals[i][0] = t;
    dirty = true;
  }
  if (dirty){
    var rng = sh.getRange(2,cRange,body,1);
    rng.clearDataValidations();
    GHM_safeSetValues_(rng, rangeVals);
  }
}

function Fix_Sanitize_TextColumns(){
  var TEXT = new Set(["operator_policy_note","description","meaning/story","meaning","story"]);
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function(sh){
    if (sh.getLastColumn() < 1) return;
    var head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){ return GHM_NORM(v); });
    var body = GHM_bodyRows(sh); if (!body) return;
    head.forEach(function(h,i){ if (TEXT.has(h)) sh.getRange(2,i+1,body,1).clearDataValidations(); });
  });
  SpreadsheetApp.getActive().toast("Cleared validation on text columns", "GHM", 4);
}

function Fix_Standard_Contract_All(){
  var ss = SpreadsheetApp.getActive();
  var nrStd = ss.getRangeByName("GHM_Standard_List");
  var nrFac = ss.getRangeByName("GHM_Factory_List");

  ss.getSheets().forEach(function(sh){
    if (GHM_EXCLUDE_TABS.has(sh.getName()) || sh.getLastColumn()<1) return;
    var b = GHM_bodyRows(sh); if (!b) return;

    [
      {label:"standard", nr:nrStd},
      {label:"contract_factory", nr:nrFac}
    ].forEach(function(it){
      var c = GHM_firstCol(sh,[it.label]) || GHM_ensureCol(sh,it.label);
      var rng = sh.getRange(2,c,b,1);
      rng.clearDataValidations();
      if (it.nr){
        rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(it.nr,true).setAllowInvalid(false).build());
      }
    });
  });

  SpreadsheetApp.getActive().toast("Standard/Contract dropdowns reset", "GHM", 4);
}

function Fix_DedupeHeader_ContractFactory(){
  var ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(function(sh){
    if (sh.getLastColumn()<1) return;
    var head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    var hits = [];
    head.forEach(function(h,i){ if (GHM_NORM(h) === "contract_factory") hits.push(i+1); });
    if (hits.length <= 1) return;

    var keep = hits[0], b = GHM_bodyRows(sh);
    if (b > 0){
      var dst = sh.getRange(2,keep,b,1).getValues();
      for (var k=1;k<hits.length;k++){
        var src = sh.getRange(2,hits[k],b,1).getValues();
        for (var r=0;r<b;r++) if (!dst[r][0] && src[r][0] !== "") dst[r][0] = src[r][0];
      }
      sh.getRange(2,keep,b,1).setValues(dst);
    }

    for (var d=hits.length-1; d>=1; d--) sh.deleteColumn(hits[d]);
  });
  SpreadsheetApp.getActive().toast("Deduped contract_factory", "GHM", 4);
}

function Control_Rebuild_Report(){
  var ss = SpreadsheetApp.getActive();
  var stdOK = new Set(["721","1155"]);
  var facOK = new Set(["Manifold","Zora","OpenSea","Custom"]);
  var out = [["Sheet","Status","Details"]];

  ss.getSheets().forEach(function(sh){
    var name = sh.getName();
    if (GHM_EXCLUDE_TABS.has(name) || sh.getLastColumn()<1) return;
    var b = GHM_bodyRows(sh);
    if (!b){ out.push([name,"OK","(no rows)"]); return; }

    var head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){ return GHM_NORM(v); });
    var sC = head.indexOf("standard");
    var fC = head.indexOf("contract_factory");
    var errs = [];

    if (sC < 0) errs.push("Missing column: standard");
    else {
      var stdVals = sh.getRange(2,sC+1,b,1).getValues().flat().map(function(x){ return String(x||"").trim(); });
      stdVals.forEach(function(v,i){ if (v && !stdOK.has(v)) errs.push("Row "+(i+2)+" standard='"+v+"'"); });
    }

    if (fC < 0) errs.push("Missing column: contract_factory");
    else {
      var facVals = sh.getRange(2,fC+1,b,1).getValues().flat().map(function(x){ return String(x||"").trim(); });
      facVals.forEach(function(v,i){ if (v && !facOK.has(v)) errs.push("Row "+(i+2)+" contract_factory='"+v+"'"); });
    }

    out.push([name, errs.length ? "ERROR" : "OK", errs.join(" | ")]);
  });

  var rep = ss.getSheetByName("GHM_CONTROL_APPLY_REPORT") || ss.insertSheet("GHM_CONTROL_APPLY_REPORT");
  rep.clear();
  rep.getRange(1,1,out.length,out[0].length).setValues(out);
  SpreadsheetApp.getActive().toast("Control report rebuilt", "GHM", 4);
}

var GHM_COLS = {
  HEADER_BG: GHM_HEADER_BG, HEADER_FG: GHM_HEADER_FG,
  MANUAL:"#ffb4b4", MANONCE:"#c7d2fe", AUTOIF:"#ffe08a", AUTO:"#b7f7a5"
};

function GHM_roleMap(){
  var add = function(arr){ return new Set(arr.map(GHM_NORM)); };
  return {
    MANUAL: add(["standard","contract_factory","token_id","title/name","title","name","pantheon","deity_or_collection",
      "meaning/story","meaning","story","frame","frame style","pallette","palette","format/medium","format medium",
      "stylisation","stylization","variant","license_url","license url","background_color","background colour",
      "edition_size","token_range","price_native","currency","chain","external_url","description","collection_item","token_name"]),
    MANONCE: add(["image_filename","animations_filename","animation_filename","unlockable_zip_filename","unlockable_zip_url",
      "unlockable_zip_bytes","unlockable_zip_sha256","unlockable_zip_notes","unlockable_notes","image_cid","json_cid","cid_video",
      "collection_path","image_path","json_path","unlockable_path","poster image","masters","previews","renders","thumbnails",
      "cid_master","cid_previews","cid_renders","cid_thumbnails","cid_poster_image"]),
    AUTOIF: add(["series","character","character_variant","variant","frame_style","colorway","edition_type","tier","medium","license"]),
    AUTO: add(["name_final","slug","alt_text_en","alt_text_zh-hans","attributes_json","image_mime","image_bytes","animation_mime",
      "animation_bytes","operator_filter","operator_policy_note","schema_version","category_id","subcategory_id","taxonomy_tags"])
  };
}

function Color_Repaint_ThisTab(){
  var sh = SpreadsheetApp.getActiveSheet();
  if (!sh){ SpreadsheetApp.getUi().alert("Open a sheet."); return; }
  if (GHM_EXCLUDE_TABS.has(sh.getName())){ SpreadsheetApp.getUi().alert("Open a collection tab."); return; }
  var cols = sh.getLastColumn(); if (cols<1) return;

  sh.getRange(1,1,1,cols).setBackground(GHM_COLS.HEADER_BG).setFontColor(GHM_COLS.HEADER_FG)
    .setFontWeight("bold").setFontFamily(GHM_FONT).setFontSize(10);
  sh.setFrozenRows(1);

  sh.setConditionalFormatRules([]);
  var head = sh.getRange(1,1,1,cols).getValues()[0].map(function(v){ return GHM_NORM(v); });
  var roles = GHM_roleMap();
  var rules = [];
  var lastRow = Math.max(2, sh.getMaxRows());

  function addRule(col, hex){
    var rng = sh.getRange(2,col,lastRow-1,1);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied("=TRUE").setBackground(hex).setRanges([rng]).build());
  }

  for (var c=0;c<cols;c++){
    var k = head[c];
    if (!k) continue;
    if (roles.MANUAL.has(k)) addRule(c+1,GHM_COLS.MANUAL);
    else if (roles.MANONCE.has(k)) addRule(c+1,GHM_COLS.MANONCE);
    else if (roles.AUTOIF.has(k)) addRule(c+1,GHM_COLS.AUTOIF);
    else if (roles.AUTO.has(k)) addRule(c+1,GHM_COLS.AUTO);
  }

  sh.setConditionalFormatRules(rules);
  SpreadsheetApp.getActive().toast("Repainted: " + sh.getName(), "GHM", 4);
}

var GHM_COMPACT_WANT = ["Series","Character","Character_Variant","token_id","standard","contract_factory","name_final","slug","operator_filter","category_id","subcategory_id","taxonomy_tags","alt_text_en"];

function View_Compact_Active_HARD(){
  var ss = SpreadsheetApp.getActive();
  var src = ss.getActiveSheet();
  if (!src || GHM_EXCLUDE_TABS.has(src.getName())){ SpreadsheetApp.getUi().alert("Open a collection tab."); return; }

  var rows = GHM_bodyRows(src);
  if (!rows){ SpreadsheetApp.getUi().alert("No data rows."); return; }

  var hm = GHM_headerMap(src).map;
  var headers = GHM_COMPACT_WANT.filter(function(h){ return hm[GHM_NORM(h)]; });
  if (!headers.length){ SpreadsheetApp.getUi().alert("No compact columns on this tab."); return; }

  var old = ss.getSheetByName("Compact_View"); if (old) ss.deleteSheet(old);
  var view = ss.insertSheet("Compact_View");

  var srcData = src.getRange(2,1,rows,src.getLastColumn()).getValues();
  var out = srcData.map(function(row){
    return headers.map(function(h){ return row[(hm[GHM_NORM(h)]||1)-1]; });
  });

  view.getRange(1,1,1,headers.length).setValues([headers]);
  if (out.length) view.getRange(2,1,out.length,headers.length).setValues(out);

  if (view.getMaxColumns()>headers.length) view.deleteColumns(headers.length+1, view.getMaxColumns()-headers.length);
  var needRows = Math.max(2, out.length+1);
  if (view.getMaxRows()>needRows) view.deleteRows(needRows+1, view.getMaxRows()-needRows);
  view.setFrozenRows(1);
  view.getRange(1,1,1,headers.length).setBackground(GHM_HEADER_BG).setFontColor(GHM_HEADER_FG).setFontWeight("bold").setFontFamily(GHM_FONT).setFontSize(10);
  SpreadsheetApp.getActive().toast("Compact_View built from active tab", "GHM", 4);
}

function View_Compact_All_HARD(){
  var ss = SpreadsheetApp.getActive();
  var tabs = ss.getSheets().filter(function(sh){ return !GHM_EXCLUDE_TABS.has(sh.getName()) && sh.getLastColumn()>=1; });

  var old = ss.getSheetByName("Compact_View"); if (old) ss.deleteSheet(old);
  var view = ss.insertSheet("Compact_View");

  var present = new Set(), union = [];
  tabs.forEach(function(t){
    var map = GHM_headerMap(t).map;
    GHM_COMPACT_WANT.forEach(function(h){
      if (map[GHM_NORM(h)] && !present.has(h)){ present.add(h); union.push(h); }
    });
  });

  if (!union.length){ SpreadsheetApp.getUi().alert("No compact columns on any tab."); return; }
  view.getRange(1,1,1,union.length).setValues([union]);

  var out = [];
  tabs.forEach(function(src){
    var rows = GHM_bodyRows(src); if (!rows) return;
    var hm = GHM_headerMap(src).map;
    var data = src.getRange(2,1,rows,src.getLastColumn()).getValues();
    data.forEach(function(row){
      out.push(union.map(function(h){
        var c = hm[GHM_NORM(h)];
        return c ? row[c-1] : "";
      }));
    });
  });

  if (out.length) view.getRange(2,1,out.length,union.length).setValues(out);

  if (view.getMaxColumns()>union.length) view.deleteColumns(union.length+1, view.getMaxColumns()-union.length);
  var needRows = Math.max(2, out.length+1);
  if (view.getMaxRows()>needRows) view.deleteRows(needRows+1, view.getMaxRows()-needRows);
  view.setFrozenRows(1);
  view.getRange(1,1,1,union.length).setBackground(GHM_HEADER_BG).setFontColor(GHM_HEADER_FG).setFontWeight("bold").setFontFamily(GHM_FONT).setFontSize(10);
  SpreadsheetApp.getActive().toast("Compact_View built from ALL collections", "GHM", 4);
}

function View_Compact_Cleanup(){
  var ss = SpreadsheetApp.getActive();
  var KEEP = "Compact_View";
  var aliases = new Set(["Compact_view","Compact view","CompactView"]);
  ss.getSheets().forEach(function(sh){
    var n = sh.getName();
    if (n === KEEP) return;
    if (aliases.has(n) || n.indexOf("Compact_") === 0) ss.deleteSheet(sh);
  });
  SpreadsheetApp.getActive().toast("Compact view aliases removed", "GHM", 4);
}

