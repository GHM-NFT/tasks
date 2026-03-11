/***************************************
 * GHM — Stage_One_Sandbox (debugged)
 * Focused fixes:
 * - single onOpen
 * - no undefined preview menu items
 * - no duplicate control enforcement in orchestrators
 * - bulk media URL reads (performance)
 * - safe delete order for legacy preview cols
 ***************************************/

var CONFIG = {
  BASE_SITE: 'https://godsheroesmyths.com/',
  IPFS_GATEWAY: 'https://cloudflare-ipfs.com/ipfs/',
  SOT_TAB_NAME: 'GHM_SoT'
};

var SOT_SYNC_FIELDS = [
  'Character_Variant',
  'myth_scene',
  'Style',
  'Colourway',
  'Frame',
  'meaning_line',
  'caption_300',
  'symbols',
  'taxonomy_tags',
  'caption_long_en',
  'research_notes',
  'sources_bibliography'
];

if (typeof POLICY_FIELDS === 'undefined') {
  var POLICY_FIELDS = [
    'chain','operator_filter','royalty_bps','contract_address',
    'reveal_mode','reveal_date','freeze_policy','freeze_date',
    'primary_mint_platform','est_gas_mint','est_gas_batch',
    'royalty_recipient','license_type','license_url','terms_url','physical_terms_url',
    'canonical_domain_or_ENS','marketplace_targets','target_fiat_price'
  ];
}

var CONTROL = {
  TAB: 'Control_GHM',
  ENFORCE_WRITE: true,
  WARN_AUTOFILL: true,
  AUTOFILL: {
    chain:true, operator_filter:true, royalty_bps:true, contract_address:true,
    reveal_mode:true, reveal_date:true, freeze_policy:true, freeze_date:true,
    primary_mint_platform:true, est_gas_mint:true, est_gas_batch:true,
    royalty_recipient:true, license_type:true, license_url:true, terms_url:true, physical_terms_url:true,
    canonical_domain_or_ENS:true, marketplace_targets:true, target_fiat_price:true
  }
};

function getHeaderRowValues_(sh){
  return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(v){return String(v).trim();});
}
function getHeaderMap_(sh){
  var row = getHeaderRowValues_(sh), map = {};
  row.forEach(function(h,i){ if(h) map[h]=i+1; });
  return map;
}
function getOrCreateCol_(sh, header){
  var H = getHeaderMap_(sh);
  if (H[header]) return H[header];
  var c = sh.getLastColumn()+1;
  sh.getRange(1,c).setValue(header);
  return c;
}
function driveUrl_(fileId, mode){ return fileId ? ('https://drive.google.com/uc?export='+(mode||'view')+'&id='+fileId) : ''; }

function fillMediaUrls_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh);
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;

  var colImgUrl=H['image_url']||getOrCreateCol_(sh,'image_url');
  var colAnimUrl=H['animation_url']||getOrCreateCol_(sh,'animation_url');

  var imgCidVals = H['image_cid'] ? sh.getRange(2,H['image_cid'],rows,1).getValues() : Array(rows).fill(['']);
  var animCidVals = H['animation_cid'] ? sh.getRange(2,H['animation_cid'],rows,1).getValues() : Array(rows).fill(['']);
  var imgDrvVals = H['drive_image_id'] ? sh.getRange(2,H['drive_image_id'],rows,1).getValues() : Array(rows).fill(['']);
  var animDrvVals = H['drive_animation_id'] ? sh.getRange(2,H['drive_animation_id'],rows,1).getValues() : Array(rows).fill(['']);

  var gw=CONFIG.IPFS_GATEWAY, outImg=[], outAni=[];
  for (var r=0;r<rows;r++){
    var ic=String(imgCidVals[r][0]||'').trim();
    var ac=String(animCidVals[r][0]||'').trim();
    var idI=String(imgDrvVals[r][0]||'').trim();
    var idA=String(animDrvVals[r][0]||'').trim();
    outImg.push([ ic?gw+ic : (idI?driveUrl_(idI,'view'):'') ]);
    outAni.push([ ac?gw+ac : (idA?driveUrl_(idA,'view'):'') ]);
  }
  sh.getRange(2,colImgUrl,rows,1).setValues(outImg);
  sh.getRange(2,colAnimUrl,rows,1).setValues(outAni);
}

function fillExternalUrlBuilt_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh);
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows||!H['slug']) return;
  var outCol=H['external_url_built']||getOrCreateCol_(sh,'external_url_built');
  var slugs=sh.getRange(2,H['slug'],rows,1).getValues();
  var out=slugs.map(function(r){var s=String(r[0]||'').trim(); return [s?CONFIG.BASE_SITE+s:''];});
  sh.getRange(2,outCol,rows,1).setValues(out);
}

function fillFilenames_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh);
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows||!H['slug']) return;
  var colJson=H['json_filename']||getOrCreateCol_(sh,'json_filename');
  var colEd=H['edition_string']||getOrCreateCol_(sh,'edition_string');
  var colMedia=H['media_filename']||getOrCreateCol_(sh,'media_filename');
  var slugs=sh.getRange(2,H['slug'],rows,1).getValues();
  var edCol=H['edition_size']?sh.getRange(2,H['edition_size'],rows,1).getValues():[];
  var mimeC=H['image_mime']?sh.getRange(2,H['image_mime'],rows,1).getValues():[];
  function extFromMime(m){m=(m||'').toLowerCase();
    if(m.indexOf('png')>-1)return'.png'; if(m.indexOf('jpeg')>-1||m.indexOf('jpg')>-1)return'.jpg';
    if(m.indexOf('webp')>-1)return'.webp'; if(m.indexOf('gif')>-1)return'.gif';
    if(m.indexOf('mp4')>-1)return'.mp4'; if(m.indexOf('quicktime')>-1||m.indexOf('mov')>-1)return'.mov';
    return'';}
  var outJ=[],outE=[],outM=[];
  for (var i=0;i<rows;i++){
    var slug=String(slugs[i][0]||'').trim();
    var ed=H['edition_size']?Number(edCol[i][0]||''):'';
    var ext=H['image_mime']?extFromMime(mimeC[i][0]):'';
    outJ.push([slug?slug+'.json':'']);
    outE.push([ed?('Edition of '+ed):'']);
    outM.push([slug?slug+ext:'']);
  }
  sh.getRange(2,colJson,rows,1).setValues(outJ);
  sh.getRange(2,colEd,rows,1).setValues(outE);
  sh.getRange(2,colMedia,rows,1).setValues(outM);
}

function fillSlug_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh);
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;
  var outCol=H['slug']||getOrCreateCol_(sh,'slug');
  function pick(h){return H[h]?sh.getRange(2,H[h],rows,1).getValues():null;}
  var Series=pick('Series'),Char=pick('Character'),Var=pick('Character_Variant'),Scene=pick('myth_scene'),Style=pick('Style'),Tok=pick('token_id');
  function slugify(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');}
  var seen=new Map(), out=[];
  for (var i=0;i<rows;i++){
    var parts=[Series&&Series[i]&&Series[i][0],Char&&Char[i]&&Char[i][0],Var&&Var[i]&&Var[i][0],Scene&&Scene[i]&&Scene[i][0],Style&&Style[i]&&Style[i][0]]
      .map(function(s){return String(s||'').trim();}).filter(Boolean);
    var base=slugify(parts.join('-')); if(!base){out.push(['']); continue;}
    var final=base;
    if (seen.has(base)){ var tok=Tok&&Tok[i]&&Tok[i][0]; final=tok?(base+'-'+tok):(base+'-dup'+(seen.get(base)+1)); }
    seen.set(base,(seen.get(base)||0)+1);
    out.push([final]);
  }
  sh.getRange(2,outCol,rows,1).setValues(out);
}

function getControl_(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONTROL.TAB) || ss.getSheetByName('Control');
  if (!sh || sh.getLastRow() < 2) return {};
  var hdrs = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  var vals = sh.getRange(2,1,1,sh.getLastColumn()).getValues()[0];
  var out = {}; hdrs.forEach(function(h,i){ out[h] = vals[i]; });
  return out;
}

function normalizeControlForPolicy_(ctl){
  ctl = ctl || {};
  // Promote *_default values to canonical policy field names when direct value is blank.
  POLICY_FIELDS.forEach(function(f){
    var direct = ctl[f];
    var fromDefault = ctl[f + '_default'];
    if ((direct === '' || direct == null) && fromDefault !== undefined && fromDefault !== '') ctl[f] = fromDefault;
  });
  // Common aliases used in GHM_Master_Control_Sheet variants.
  if ((ctl.contract_address === '' || ctl.contract_address == null) && ctl.collection_address) {
    ctl.contract_address = ctl.collection_address;
  }
  if ((ctl.contract_address === '' || ctl.contract_address == null) && ctl.contract_address_default) {
    ctl.contract_address = ctl.contract_address_default;
  }
  if ((ctl.marketplace_targets === '' || ctl.marketplace_targets == null) && ctl.collection_slug) {
    ctl.marketplace_targets = ctl.collection_slug;
  }
  // Common alias used in single-kit control sheets.
  if ((ctl.royalty_recipient === '' || ctl.royalty_recipient == null) && ctl.fee_recipient_default) {
    ctl.royalty_recipient = ctl.fee_recipient_default;
  }
  return ctl;
}


function enforceControlPolicies_(sh, H, ctl){
  var rows = Math.max(0, sh.getLastRow()-1); if (!rows) return;
  var warnCol = H['warnings'] || getOrCreateCol_(sh,'warnings');
  var warnVals = sh.getRange(2,warnCol,rows,1).getValues();
  var pick = function(h){ return H[h] ? sh.getRange(2,H[h],rows,1).getValues().map(function(r){return r[0];}) : Array(rows).fill(''); };
  var vals = {}; POLICY_FIELDS.forEach(function(f){ vals[f] = pick(f); });
  var dirtyWarn=false; var dirty={}; POLICY_FIELDS.forEach(function(f){ dirty[f]=false; });

  for (var i=0;i<rows;i++){
    var adds=[];
    POLICY_FIELDS.forEach(function(f){
      var cur = vals[f][i], want = ctl ? ctl[f] : undefined;
      var allowAuto = CONTROL.ENFORCE_WRITE && CONTROL.AUTOFILL && CONTROL.AUTOFILL[f];
      if ((cur==='' || cur==null) && allowAuto && want!==undefined && want!==''){
        vals[f][i] = want; dirty[f]=true; if (CONTROL.WARN_AUTOFILL) adds.push('autofilled: '+f);
      }
    });
    if (adds.length){
      var prev = String(warnVals[i][0]||'').trim();
      var parts = prev ? prev.split(/;\s*/) : [];
      adds.forEach(function(a){ if (parts.indexOf(a) === -1) parts.push(a); });
      var merged = parts.filter(Boolean).join('; ');
      if (merged !== prev) {
        warnVals[i][0] = merged;
        dirtyWarn = true;
      }
    }
  }
  if (dirtyWarn) sh.getRange(2,warnCol,rows,1).setValues(warnVals);
  if (CONTROL.ENFORCE_WRITE){
    POLICY_FIELDS.forEach(function(f){
      if (!dirty[f]) return; var col = H[f]; if (!col) return;
      sh.getRange(2,col,rows,1).setValues(vals[f].map(function(v){return [v];}));
    });
  }
}


function fillSoTStatus_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), ss=SpreadsheetApp.getActive();
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;
  var outCol=getOrCreateCol_(sh,'sot_status');
  var sot=ss.getSheetByName(CONFIG.SOT_TAB_NAME);
  if(!sot){ sh.getRange(2,outCol,rows,1).setValues(Array(rows).fill([false])); return; }
  var H=getHeaderMap_(sh), Hs=getHeaderMap_(sot); if(!H['slug']||!Hs['slug']) return;
  var manifest=sh.getRange(2,H['slug'],rows,1).getValues().map(function(r){return String(r[0]||'').trim();});
  var chars=H['Character'] ? sh.getRange(2,H['Character'],rows,1).getValues().map(function(r){return String(r[0]||'').trim();}) : Array(rows).fill('');
  var sotRows=Math.max(0,sot.getLastRow()-1);
  var sotSlugs=sot.getRange(2,Hs['slug'],sotRows,1).getValues().map(function(r){return String(r[0]||'').trim();});
  function normToken_(v){
    var s=String(v||'').toLowerCase().trim();
    s=s.replace(/posiedon/g,'poseidon').replace(/olympians/g,'olympian').replace(/[^a-z0-9]+/g,'');
    return s;
  }
  var set=new Set(sotSlugs);
  var tokSet=new Set();
  sotSlugs.forEach(function(sl){ sl.toLowerCase().split(/[^a-z0-9]+/).map(normToken_).filter(Boolean).forEach(function(t){tokSet.add(t);}); });
  var out=[];
  for (var i=0;i<rows;i++){
    var hit=set.has(manifest[i]);
    if (!hit && chars[i]) hit=tokSet.has(normToken_(chars[i]));
    out.push([hit]);
  }
  sh.getRange(2,outCol,rows,1).setValues(out);
}

function pullSoT_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), ss=SpreadsheetApp.getActive();
  var sot=ss.getSheetByName(CONFIG.SOT_TAB_NAME); if(!sot) return;
  var H=getHeaderMap_(sh), Hs=getHeaderMap_(sot); if(!Hs['slug']||!H['slug']) return;
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;
  var manifest=sh.getRange(2,H['slug'],rows,1).getValues().map(function(r){return String(r[0]||'').trim();});
  var chars=H['Character'] ? sh.getRange(2,H['Character'],rows,1).getValues().map(function(r){return String(r[0]||'').trim();}) : Array(rows).fill('');
  var sotRows=Math.max(0,sot.getLastRow()-1);
  var data=sot.getRange(2,1,sotRows,sot.getLastColumn()).getValues();
  var hdrs=getHeaderRowValues_(sot), idx={}; hdrs.forEach(function(h,i){idx[h]=i;});

  function normToken_(v){
    var s=String(v||'').toLowerCase().trim();
    s=s.replace(/posiedon/g,'poseidon').replace(/olympians/g,'olympian').replace(/[^a-z0-9]+/g,'');
    return s;
  }
  var charLut=new Map();
  chars.forEach(function(c){ var n=normToken_(c); if(n) charLut.set(n,true); });

  var m=new Map(), byChar=new Map(), si=idx['slug'];
  data.forEach(function(r){
    var s=String(r[si]||'').trim();
    if(!s) return;
    m.set(s,r);
    var toks=s.toLowerCase().split(/[^a-z0-9]+/).map(normToken_).filter(Boolean);
    for (var ti=0; ti<toks.length; ti++){
      if (charLut.has(toks[ti]) && !byChar.has(toks[ti])) { byChar.set(toks[ti], r); break; }
    }
  });

  function pickRow(i){
    var r=m.get(manifest[i]);
    if (r) return r;
    var c=normToken_(chars[i]);
    return c ? (byChar.get(c) || null) : null;
  }

  function idxForHeader(h){
    if (idx[h]!==undefined) return idx[h];
    var low = String(h).toLowerCase();
    if (idx[low]!==undefined) return idx[low];
    if (low === 'colourway' && idx['Colorway']!==undefined) return idx['Colorway'];
    if (low === 'colourway' && idx['colorway']!==undefined) return idx['colorway'];
    return undefined;
  }

  function setColIf(header,getter){
    var col=H[header] || H[String(header).toLowerCase()];
    if (!col && String(header).toLowerCase()==='colourway') col = H['Colorway'] || H['colorway'];
    if (!col) return; // do not create unexpected columns from SoT sync
    var out=[];
    for (var i=0;i<rows;i++){ var row=pickRow(i); out.push([ row ? getter(row) : '' ]); }
    sh.getRange(2,col,rows,1).setValues(out);
  }

  // Sync only whitelisted SoT fields requested for main doc.
  for (var fi=0; fi<SOT_SYNC_FIELDS.length; fi++){
    var field = SOT_SYNC_FIELDS[fi];
    var srcIdx = idxForHeader(field);
    if (srcIdx===undefined) continue;
    (function(j, h){ setColIf(h, function(r){ return r[j]; }); })(srcIdx, field);
  }
  fillSoTStatus_(sh);
}



function fillAltTextEn_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh);
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;
  var outCol=H['alt_text_en']||getOrCreateCol_(sh,'alt_text_en');
  var titleVals=H['title_en']?sh.getRange(2,H['title_en'],rows,1).getValues():Array(rows).fill(['']);
  var nameVals=H['name_final']?sh.getRange(2,H['name_final'],rows,1).getValues():Array(rows).fill(['']);
  var charVals=H['Character']?sh.getRange(2,H['Character'],rows,1).getValues():Array(rows).fill(['']);
  var sceneVals=H['myth_scene']?sh.getRange(2,H['myth_scene'],rows,1).getValues():Array(rows).fill(['']);
  var cur=sh.getRange(2,outCol,rows,1).getValues();
  function trunc(s,n){s=String(s||'').trim(); return s.length<=n?s:s.slice(0,n).trim();}
  for (var i=0;i<rows;i++){
    if (String(cur[i][0]||'').trim()) continue;
    var base=String(titleVals[i][0]||'').trim()||String(nameVals[i][0]||'').trim()||String(charVals[i][0]||'').trim();
    var scene=String(sceneVals[i][0]||'').trim();
    var txt=base;
    if (scene && base && txt.toLowerCase().indexOf(scene.toLowerCase())===-1) txt=base+'. '+scene+'.';
    if (!txt) txt='Artwork image.';
    cur[i][0]=trunc(txt,125);
  }
  sh.getRange(2,outCol,rows,1).setValues(cur);
}

function fillTaxonomyIds_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), ss=SpreadsheetApp.getActive();
  var mapSh=ss.getSheetByName('Taxonomy_Map')||ss.getSheetByName('Taxonomy_mapping'); if(!mapSh) return;
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;
  var H=getHeaderMap_(sh); if(!H['Series']) return;
  var mapVals=mapSh.getDataRange().getValues(); if(mapVals.length<2) return;
  var headers=mapVals.shift().map(function(h){return String(h).trim().toLowerCase();});
  var si=headers.indexOf('series_key'), ci=headers.indexOf('category_id'), sbi=headers.indexOf('subcategory_id');
  if(si<0||ci<0||sbi<0) return;
  var lut=new Map();
  mapVals.forEach(function(r){ var k=String(r[si]||'').toLowerCase().trim(); if(k) lut.set(k,{cat:r[ci],sub:r[sbi]}); });
  var seriesVals=sh.getRange(2,H['Series'],rows,1).getValues();
  var catCol=H['category_id']||getOrCreateCol_(sh,'category_id');
  var subCol=H['subcategory_id']||getOrCreateCol_(sh,'subcategory_id');
  var outC=[], outS=[];
  for (var i=0;i<rows;i++){ var hit=lut.get(String(seriesVals[i][0]||'').toLowerCase().trim()); outC.push([hit?hit.cat:'']); outS.push([hit?hit.sub:'']); }
  sh.getRange(2,catCol,rows,1).setValues(outC);
  sh.getRange(2,subCol,rows,1).setValues(outS);
}

function fillJsonGateAndWarnings_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh);
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;
  var colStatus=H['status_json']||getOrCreateCol_(sh,'status_json');
  var colMiss=H['missing_fields']||getOrCreateCol_(sh,'missing_fields');
  var img=H['image_cid']?sh.getRange(2,H['image_cid'],rows,1).getValues():Array(rows).fill(['']);
  var lic=H['license_url']?sh.getRange(2,H['license_url'],rows,1).getValues():Array(rows).fill(['']);
  var outS=[], outM=[];
  for (var i=0;i<rows;i++){
    var miss=[];
    if(!String(img[i][0]||'').trim()) miss.push('image_cid');
    if(!String(lic[i][0]||'').trim()) miss.push('license_url');
    outM.push([miss.join(', ')]);
    outS.push([miss.length?'BLOCKED':'OK']);
  }
  sh.getRange(2,colStatus,rows,1).setValues(outS);
  sh.getRange(2,colMiss,rows,1).setValues(outM);
}

function fillSeoAutos_(_sh){
  var sh=_sh||SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh);
  var rows=Math.max(0,sh.getLastRow()-1); if(!rows) return;
  var colTitle=H['meta_title_auto']||getOrCreateCol_(sh,'meta_title_auto');
  var colDesc=H['meta_description_auto']||getOrCreateCol_(sh,'meta_description_auto');
  var colOg=H['og_image_auto']||getOrCreateCol_(sh,'og_image_auto');
  var name=H['name_final']?sh.getRange(2,H['name_final'],rows,1).getValues():Array(rows).fill(['']);
  var cap=H['caption_300']?sh.getRange(2,H['caption_300'],rows,1).getValues():Array(rows).fill(['']);
  var desc=H['description_en']?sh.getRange(2,H['description_en'],rows,1).getValues():Array(rows).fill(['']);
  var img=H['image_url']?sh.getRange(2,H['image_url'],rows,1).getValues():Array(rows).fill(['']);
  function trunc(s,n){s=String(s||'').trim(); return s.length<=n?s:s.slice(0,n-1)+'…';}
  var outT=[],outD=[],outO=[];
  for (var i=0;i<rows;i++){
    var t=trunc(String(name[i][0]||''),60);
    var d=trunc(String(cap[i][0]||'').trim()||String(desc[i][0]||'').trim(),155);
    outT.push([t]); outD.push([d]); outO.push([String(img[i][0]||'').trim()]);
  }
  sh.getRange(2,colTitle,rows,1).setValues(outT);
  sh.getRange(2,colDesc,rows,1).setValues(outD);
  sh.getRange(2,colOg,rows,1).setValues(outO);
}

function enforceCoreControlDefaults_(sh, H, ctl){
  var rows = Math.max(0, sh.getLastRow()-1); if (!rows) return;
  ctl = ctl || {};

  function syncCore(header, value){
    if (value===undefined || value===null || value==='') return;
    var col = H[header] || getOrCreateCol_(sh, header);
    var rng = sh.getRange(2,col,rows,1);
    var vals = rng.getValues();
    var changed=false;
    var want = String(value).trim();
    for (var i=0;i<rows;i++){
      var cur = vals[i][0];
      var curStr = String(cur==null ? '' : cur).trim();
      // Core fields should stay aligned with control defaults in sandbox runs.
      if (curStr === '' || curStr.toLowerCase() !== want.toLowerCase()){
        vals[i][0]=value;
        changed=true;
      }
    }
    if (changed) rng.setValues(vals);
  }

  syncCore('standard', ctl.standard_default || ctl.standard);
  syncCore('contract_factory', ctl.contract_factory_default || ctl.contract_factory);
  syncCore('operator_filter', ctl.operator_filter_default || ctl.operator_filter);
  syncCore('operator_policy_note', ctl.operator_policy_note_default || ctl.operator_policy_note);
}

function runAllSandbox_(){
  var sh = SpreadsheetApp.getActiveSheet();
  var H = getHeaderMap_(sh);
  fillSlug_(sh);
  fillMediaUrls_(sh);
  fillFilenames_(sh);
  fillExternalUrlBuilt_(sh);
  try { fillAltTextEn_(sh); } catch(e){}
  try { fillTaxonomyIds_(sh); } catch(e){}
  try { fillJsonGateAndWarnings_(sh); } catch(e){}
  try { fillSeoAutos_(sh); } catch(e){}

  // Call once only.
  var ctl = normalizeControlForPolicy_(getControl_());
  try { enforceControlPolicies_(sh, H, ctl); } catch(e){}
  try { enforceCoreControlDefaults_(sh, H, ctl); } catch(e){}
  try { pullSoT_(sh); } catch(e){}
}

function RUN_updateAll_now(){
  var sh = SpreadsheetApp.getActiveSheet();
  var H = getHeaderMap_(sh);
  fillSlug_(sh);
  fillMediaUrls_(sh);
  fillFilenames_(sh);
  fillExternalUrlBuilt_(sh);
  try { fillAltTextEn_(sh); } catch(e){}
  try { fillTaxonomyIds_(sh); } catch(e){}
  try { fillJsonGateAndWarnings_(sh); } catch(e){}
  try { fillSeoAutos_(sh); } catch(e){}

  // Call once only.
  var ctl = normalizeControlForPolicy_(getControl_());
  try { enforceControlPolicies_(sh, H, ctl); } catch(e){}
  try { enforceCoreControlDefaults_(sh, H, ctl); } catch(e){}
  try { pullSoT_(sh); } catch(e){}
}

function GHM_RemoveLegacyPreviewColsOnce(){
  var sh=SpreadsheetApp.getActiveSheet(), H=getHeaderMap_(sh), cols=[];
  ['preview_thumb','thumb_url','thumb_full_url'].forEach(function(h){ if (H[h]) cols.push(H[h]); });
  cols.sort(function(a,b){ return b-a; });
  cols.forEach(function(c){ sh.deleteColumn(c); });
}

function BuildGhmAutosMenu_(){
  SpreadsheetApp.getUi()
    .createMenu('GHM Autos')
    .addItem('1) Media URLs','fillMediaUrls_')
    .addItem('2) External URL (built)','fillExternalUrlBuilt_')
    .addItem('3) Filenames','fillFilenames_')
    .addItem('4) Build slug','fillSlug_')
    .addSeparator()
    .addItem('Run All (Sandbox)','runAllSandbox_')
    .addToUi();
}

