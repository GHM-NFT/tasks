CODEX HANDOFF — Google Drive Staging + Sheet Testing
Goal
Support Google Drive as a temporary staging layer for media files and implement basic testing checks for the sheet pipeline.
This is not part of the final NFT metadata. Drive is only used for processing, testing, and automation.

1. Google Drive Staging Fields
Fields involved

drive_image_id
drive_animation_id

Purpose
Store the Google Drive file IDs for source media so scripts can access files during testing and processing.
Example values:

drive_image_id = 1AbCDeFgHIjkLmNopQRs
drive_animation_id = 1xYZabcDeFGhiJKLmnoP

These IDs allow scripts to:
	•	download media
	•	run processing scripts
	•	compute checksums
	•	upload to IPFS
	•	test the pipeline

Important rules
Drive fields are temporary.
They must not appear in final JSON metadata.
Final metadata uses:

image_cid
animation_cid
image_url
animation_url

Drive IDs are only used in the production workflow.

2. Media Processing Flow
Current intended pipeline:

Artist exports media
        ↓
Upload files to Google Drive
        ↓
drive_image_id / drive_animation_id stored in sheet
        ↓
scripts download media
        ↓
scan + merge processing
        ↓
checksum + metadata validation
        ↓
upload to IPFS
        ↓
image_cid / animation_cid generated

After IPFS upload, Drive IDs are no longer required.

3. Testing Requirements
Please implement or verify the following tests.
Sheet Structure Tests
Confirm required columns exist:

slug
name_final
image_filename
image_cid
animation_filename
schema_version

Detect duplicates such as:

image_mime.1
animation_bytes.1
Thumbnails.1


Formula Tests
Verify formulas work for:

Rarity
display_order
QC length checks
edition_string


Data Validation Tests
Check:

slug uniqueness
token_id uniqueness
edition_size numeric
background_hex format (#RRGGBB)
token_range empty OR numeric range


Media Pipeline Tests
If Drive IDs exist:

drive_image_id
drive_animation_id

Script should confirm:

file exists
file accessible
mime type valid
file size detected


JSON Export Tests
Confirm that rows ready for export contain:

slug
name_final
description_en
image_cid

Then:

json_will_emit = TRUE

Otherwise:

json_will_emit = FALSE


4. Expected Behavior
Drive IDs are used only during development and processing.
Final NFT metadata should contain no Google Drive references.
Drive acts as a temporary media staging environment before permanent storage.

End of Handoff
