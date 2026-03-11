5 levels of Testing

1. Structure Testing (Schema Tests)
Purpose: ensure the sheet layout is correct.
Check:
	•	required columns exist
	•	column names match expected names
	•	no duplicates (image_mime.1, Thumbnails.1, etc.)
	•	correct column order where required
	•	required tabs exist:
	◦	Control
	◦	Order_Map
	◦	Tier_Rarity
	◦	collection tabs
Example tests

schema_version column exists
slug column exists
image_mime column exists

Run when:
	•	columns added
	•	sheet updated
	•	new collection tab created

2. Formula Testing
Purpose: confirm formulas behave correctly.
Test areas:
	•	rarity lookup
	•	display_order
	•	QC length checks
	•	slug generation
	•	edition string
Example checks

Tier = Legendary → Rarity = Legendary
slug length > 100 → status_slug = RED

Run when:
	•	formulas updated
	•	mappings changed

3. Data Integrity Testing
Purpose: ensure metadata values are valid.
Checks include:
Required fields

slug
name_final
description_en
image_filename

Format validation

background_hex = #RRGGBB
token_range = empty or numeric range
edition_size = numeric

Uniqueness

slug must be unique
token_id must be unique


4. Media Pipeline Testing
Purpose: ensure media processing works.
Test:
Image fields

image_filename
image_mime
image_bytes
image_width
image_height

Animation fields

animation_filename
animation_mime
animation_duration_s

Validation

checksum_ok
image_checksum

Run when:
	•	new renders added
	•	scan/merge updated
	•	IPFS workflow tested

5. Export / Mint Testing
Purpose: ensure NFT platforms accept the output.
Test:
JSON generation

attributes structure
external_url
image_url
animation_url

Marketplace compatibility

OpenSea metadata preview
JSON validation
CID loading

Test:
	•	1–5 sample tokens first.

Recommended testing routine
Daily testing

QC checks
formula checks
slug uniqueness

Pipeline testing

media scan
CID upload
JSON preview

Pre-mint testing

schema freeze
full sheet validation
export test tokens
OpenSea preview


Optional advanced testing
Some teams also run:
Script tests

Control tab updates
batch update script
media scan script

Performance tests

5000 rows
formula recalculation speed


Simple rule for your sheet
Test these four things regularly:

structure
formulas
data validity
export output

Everything else builds on those.
