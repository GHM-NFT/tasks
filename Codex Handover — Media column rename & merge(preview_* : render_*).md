Codex Handover — Media column rename & merge(preview_* / render_*)
Scope (only these changes)
	•	New canonical media columns: preview_* and render_* (filename, mime, bytes, sha256, cid, url, thumb).
	•	Keep old image_* / animation_* as temporary aliases in the sheet (owner has already done this).
	•	Update Apps Script helpers that read/write media fields to prefer the new names and produce aliases for backward compatibility.
	•	Update JSON gate/packager to require preview_cid (include render_cid in JSON if present).
	•	Update packager to expect packager CSV to emit preview_* / render_*.

Scripts This Effects ?
Which of the following scripts are effected, I’m not 100% Sure
	1.	ghm_single_kit_debugged.gs
	2.	Stage_One_Sandbox_debugged.gs
	3.	GHM_Canonicalize.gs
	4.	Refresh_Active_Tab.gs
	5.	Contact_Address_Update.gs
	6.	Fill_ Taxonomy_From_Mapping.gs
	7.	Derived _Metadata_Refresh.gs ghm_tokenid_suffix_columns.gs
	8.	GHM_Audit_Final.gs
	9.	Active_QA.gs dev_tools.gs
	10.	helpers_restore.gs
	11.	X_ Fix_active_tab.gs
	12.	GHM_FastCompact.gs
	13.	Apply_GHM_SoT.gs

Files / functions to change
Make the following edits in your Apps Script project (the file(s) that implement RUN_updateAll_now and helpers):
	1	File: (where RUN_updateAll_now sits — e.g., Code.gs or updateAll.gs) Functions to update/replace:
	◦	fillMediaUrls_ (replace or update) — build preview_url & render_url from preview_cid/render_cid. Also write legacy image_url/animation_url aliases if those headers exist.
	◦	fillPreviewThumb_ (replace or update) — reference preview_url for the IMAGE() thumbnail column (not image_url).
	◦	fillFilenames_ (replace or update) — derive media_filename from preview_mime and render_media_filename from render_mime. Produce json_filename.
	◦	fillChecksumOk_ (replace or update) — validate using preview_bytes/preview_sha256 and render_bytes/render_sha256. Accept bytes-only or enforce SHA depending on config.
	◦	fillJsonGateAndWarnings_ (update) — require preview_cid (not image_cid) for json_will_emit; include render_cid in emitted JSON if present.
	◦	packager / emitJson_ / writeJson_ (update) — ensure JSON uses preview_cid/render_cid and includes preview/render metadata.
	2	File: any script that builds provenance_block_sha or pinning
	◦	Include preview_cid first, then render_cid in the provenance / ordering. Update any pin queues to pin preview_cid / render_cid.
	3	Header mapping: ensure headerMap_(sheet) returns new header keys:
	◦	preview_filename, preview_mime, preview_bytes, preview_sha256, preview_cid, preview_url, preview_thumb
	◦	render_filename, render_mime, render_bytes, render_sha256, render_cid, render_url
	◦	continue to expose image_*/animation_* if alias support is desired temporarily.

Exact code snippets (drop-in)
Note: these are the exact snippets we vetted for sheet logic. Devs can paste them in and wire them to the existing RUN_updateAll_now flow.
Helper (gateway URL + column letter)

function buildGatewayUrl_(cid){
  if(!cid) return "";
  cid = String(cid).trim();
  if(cid==="") return "";
  if(cid.indexOf("http://") === 0 || cid.indexOf("https://") === 0) return cid;
  if(cid.indexOf("ipfs://") === 0) return cid.replace("ipfs://","https://cloudflare-ipfs.com/ipfs/");
  return "https://cloudflare-ipfs.com/ipfs/" + cid;
}

function columnLetter_(col){
  var temp='', letter='';
  while(col>0){
    temp = (col-1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = (col - temp - 1) / 26;
  }
  return letter;
}

fillMediaUrls_ — prefer preview_cid / render_cid; write legacy aliases

function fillMediaUrls_(sh, H){
  var lastRow = sh.getLastRow();
  if(lastRow < 2) return;

  var previewCidCol = H['preview_cid'] || H['image_cid'];
  var renderCidCol  = H['render_cid']  || H['animation_cid'];

  var previewUrlCol = H['preview_url'];
  var renderUrlCol  = H['render_url'];

  var imageUrlCol     = H['image_url'];     // optional legacy
  var animationUrlCol = H['animation_url'];

  var previewCids = previewCidCol ? sh.getRange(2, previewCidCol, lastRow-1, 1).getValues().map(function(r){return r[0];}) : [];
  var renderCids  = renderCidCol  ? sh.getRange(2, renderCidCol, lastRow-1, 1).getValues().map(function(r){return r[0];})  : [];

  var previewUrls = previewCids.map(function(cid){ return [ buildGatewayUrl_(cid) ]; });
  var renderUrls  = renderCids.map(function(cid){ return [ buildGatewayUrl_(cid) ]; });

  if(previewUrlCol) sh.getRange(2, previewUrlCol, previewUrls.length, 1).setValues(previewUrls);
  if(renderUrlCol)  sh.getRange(2, renderUrlCol, renderUrls.length, 1).setValues(renderUrls);

  // Legacy aliases to avoid breaking older code
  if(imageUrlCol && previewUrls.length)    sh.getRange(2, imageUrlCol, previewUrls.length, 1).setValues(previewUrls);
  if(animationUrlCol && renderUrls.length) sh.getRange(2, animationUrlCol, renderUrls.length, 1).setValues(renderUrls);
}

fillPreviewThumb_ — thumb formula from preview_url

function fillPreviewThumb_(sh, H){
  if(!H['preview_url'] || !H['preview_thumb']) return;
  var imgColLetter = columnLetter_(H['preview_url']);
  var lastRow = sh.getLastRow();
  for(var r = 2; r <= lastRow; r++){
    var formula = '=IF(' + imgColLetter + r + '<>"", IMAGE(' + imgColLetter + r + '), "")';
    sh.getRange(r, H['preview_thumb']).setFormula(formula);
  }
}

fillFilenames_ — derive media filenames from preview_mime / render_mime

function extFromMime_(mime, fallbackFilename){
  var map = {
    "image/png":"png","image/jpeg":"jpg","image/jpg":"jpg","image/gif":"gif",
    "image/webp":"webp","video/mp4":"mp4","video/webm":"webm"
  };
  if(mime && map[mime]) return map[mime];
  if(fallbackFilename){
    var m = String(fallbackFilename).match(/\.([A-Za-z0-9]+)$/);
    return m ? m[1] : "";
  }
  return "";
}

function fillFilenames_(sh, H){
  var lastRow = sh.getLastRow();
  if(lastRow < 2) return;

  var slugCol = H['slug'];
  var previewMimeCol = H['preview_mime'] || H['image_mime'];
  var renderMimeCol = H['render_mime'] || H['animation_mime'];

  var mediaFilenameCol = H['media_filename'];
  var renderMediaFilenameCol = H['render_media_filename']; // optional
  var jsonFilenameCol = H['json_filename'];

  var slugs = slugCol ? sh.getRange(2, slugCol, lastRow-1, 1).getValues().map(function(r){return r[0];}) : [];
  var previewMimes = previewMimeCol ? sh.getRange(2, previewMimeCol, lastRow-1,1).getValues().map(function(r){return r[0];}) : [];
  var renderMimes = renderMimeCol ? sh.getRange(2, renderMimeCol, lastRow-1,1).getValues().map(function(r){return r[0];}) : [];

  var previewFilenames = slugs.map(function(slug,i){
    var ext = extFromMime_(previewMimes[i], "");
    return slug ? (ext ? slug + "." + ext : slug) : "";
  });
  var renderFilenames = slugs.map(function(slug,i){
    var ext = extFromMime_(renderMimes[i], "");
    return slug ? (ext ? slug + "-render." + ext : slug + "-render") : "";
  });
  var jsonFilenames = slugs.map(function(slug){ return slug ? slug + ".json" : ""; });

  if(mediaFilenameCol)        sh.getRange(2, mediaFilenameCol, previewFilenames.length, 1).setValues(previewFilenames.map(function(x){return [x];}));
  if(renderMediaFilenameCol)  sh.getRange(2, renderMediaFilenameCol, renderFilenames.length, 1).setValues(renderFilenames.map(function(x){return [x];}));
  if(jsonFilenameCol)         sh.getRange(2, jsonFilenameCol, jsonFilenames.length, 1).setValues(jsonFilenames.map(function(x){return [x];}));
}

fillChecksumOk_ — sample server-side logic (safe default: accept bytes-only OR SHA)

function fillChecksumOk_(sh, H){
  var lastRow = sh.getLastRow();
  if(lastRow < 2) return;

  var pCidCol = H['preview_cid'] || H['image_cid'];
  var pBytesCol = H['preview_bytes'] || H['image_bytes'];
  var pShaCol = H['preview_sha256'] || H['image_sha256'];
  var rCidCol = H['render_cid'] || H['animation_cid'];
  var rBytesCol = H['render_bytes'] || H['animation_bytes'];
  var rShaCol = H['render_sha256'] || H['animation_sha256'];
  var outCol = H['checksum_ok'];

  var pBytes = pBytesCol ? sh.getRange(2,pBytesCol,lastRow-1,1).getValues().map(function(r){return Number(r[0])||0;}) : [];
  var pShas  = pShaCol ? sh.getRange(2,pShaCol,lastRow-1,1).getValues().map(function(r){return String(r[0]||"");}) : [];
  var pCids  = pCidCol ? sh.getRange(2,pCidCol,lastRow-1,1).getValues().map(function(r){return String(r[0]||"");}) : [];

  var rBytes = rBytesCol ? sh.getRange(2,rBytesCol,lastRow-1,1).getValues().map(function(r){return Number(r[0])||0;}) : [];
  var rShas  = rShaCol ? sh.getRange(2,rShaCol,lastRow-1,1).getValues().map(function(r){return String(r[0]||"");}) : [];
  var rCids  = rCidCol ? sh.getRange(2,rCidCol,lastRow-1,1).getValues().map(function(r){return String(r[0]||"");}) : [];

  var out = [];
  for(var i=0;i<lastRow-1;i++){
    var pOk = (pCids[i] && pBytes[i]>0 && pShas[i] && pShas[i].length===64) || (pCids[i] && pBytes[i]>0 && !pShas[i]);
    var rOk = (rCids[i] && rBytes[i]>0 && rShas[i] && rShas[i].length===64) || (rCids[i] && rBytes[i]>0 && !rShas[i]);
    out.push([ (pOk || rOk) ? true : false ]);
  }
  sh.getRange(2, outCol, out.length, 1).setValues(out);
}


4) JSON gate & Packager changes
	•	Require preview_cid for json_will_emit. Where code previously checked image_cid, change to check preview_cid.
	•	JSON payload must include at minimum:  {
	•	  "image": { "cid": "<preview_cid>", "mime": "<preview_mime>", "bytes": <preview_bytes> },
	•	  "animation": { "cid": "<render_cid>", "mime": "<render_mime>", "bytes": <render_bytes> } // optional
	•	} 
	•	Keep legacy fields for a transition: write image_cid = preview_cid until old consumers are updated.

5) Packager / provenance
	•	Include preview_cid then render_cid (if present) when computing provenance/pin lists.
	•	Packager must emit preview_filename, preview_mime, preview_bytes, preview_sha256, preview_cid and the render equivalents.

6) Test plan When Ready (required)
	1	Unit tests / dev smoke: run existing unit tests — update any tests that referenced image_*/animation_*.
	2	Manual test with 3 tokens (happy path):
	◦	Populate rows with preview + render files (filename, mime, bytes, sha256). Also set preview_cid/render_cid to test CIDs.
	◦	Run RUN_updateAll_now. Verify:
	▪	preview_url and render_url are set and resolve.
	▪	preview_thumb IMAGE() renders.
	▪	media_filename and render_media_filename derived correctly.
	▪	checksum_ok = TRUE.
	▪	json_will_emit = TRUE and exported JSON includes preview_cid (and render_cid).
	▪	Provenance/pin queue includes preview+render cids in order.
	3	Edge cases:
	◦	Missing SHA (still okay if bytes+cid present).
	◦	Only preview present, render absent.
	◦	Missing preview_cid → json_will_emit must be FALSE.
	4	Back-compat test: ensure old consumer code that reads image_url, image_cid still finds values (aliases present) during transition.
	5	Rollback: confirm alias columns exist; if deploy causes issues, re-point code to alias columns quickly.

7) Deployment notes & timing
	•	Deploy in two phases:
	1	Safe phase: Add new columns & aliases (already done). Deploy Apps Script changes in staging and run smoke tests.
	2	Flip phase: Update producers/packager to emit preview_*/render_*. Update JSON consumers. Remove aliases after 1–2 successful release cycles.

8) Deliverables for Codex
	•	Apply the 5 function replacements/updates above (code snippets included).
	•	Update headerMap_ to include new headers and aliases.
	•	Update packager and JSON emitter to require preview_cid.
	•	Add tests in CI: the 3-token manual smoke test as an automated test if possible.
	•	Provide a PR with changes + a short README summarising the column mapping and the deprecation timeline for image_*/animation_*.
	•	## Output Required

Codex must provide:

1. Plain-English explanation
2. List of files modified and/or created
3. Found errors or problems
