# Task

## Goal
1. The GHM_SoT Tab applied onto the active google tab ex. Greek - The Titans with no errors. A seperate piece of script is added to the GHM Autos DRop down menu on the google doc interface.
2. Stop adding extra columns onto the GHM_SoT

## Context
This updates the active collection doc from the GHM_SoT
The following rows are to be added to the active tab
Character_Variant
myth_scene
Style
Colourway
Frame
slug
meaning_line
caption_300
symbols	taxonomy_tags
caption_long_en
research_notes
sources_bibliography
HIDDEN_OPS - columns hidden

These are the extra tabs being added onto the GHM_SoT

Example:
This affects the contact form on the homepage.
Tight

## Files Likely Involved
ghm_single_kit_debugged.gs
Stage_One_Sandbox_debugged.gs

Example:
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
## Constraints
Do NOT:
- redesign UI
- change unrelated files

## Definition of Done
The task is complete when:
- All the data from GHM_SoT is being added onto the google Doc
- A new Menu dropdown (Add GHM_Sot) in the GHM Autos dropdown to active tab onlyt
- A seperate clean script built from older scripts under its own heading ....gs

## Output Required
Codex must provide:

1. Plain-English explanation
2. List of files modified and created
