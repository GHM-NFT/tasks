import argparse
import mimetypes
from pathlib import Path
from google.cloud import storage

BUCKET_NAME = "ghm-nft-assets"
VALID_TYPES = {"images", "animations", "thumbnails", "metadata"}

def upload_folder(collection, asset_type, src_dir, overwrite=False, dry_run=False):

    collection = collection.strip().lower()

    if asset_type not in VALID_TYPES:
        raise ValueError("Invalid asset type")

    src_path = Path(src_dir)

    if not src_path.exists() or not src_path.is_dir():
        raise ValueError("Source directory not found")

    client = storage.Client()
    files = [p for p in src_path.iterdir() if p.is_file()]

    bucket = None
import argparse
import mimetypes
from pathlib import Path
from google.cloud import storage

BUCKET_NAME = "ghm-nft-assets"
VALID_TYPES = {"images", "animations", "thumbnails", "metadata"}


def upload_folder(collection, asset_type, src_dir, overwrite=False, dry_run=False):
    collection = collection.strip().lower()

    if asset_type not in VALID_TYPES:
        raise ValueError("Invalid asset type")

    src_path = Path(src_dir)

    if not src_path.exists() or not src_path.is_dir():
        raise ValueError("Source directory not found")

    files = [p for p in src_path.iterdir() if p.is_file()]

    bucket = None
    if not dry_run:
        client = storage.Client()
        bucket = client.bucket(BUCKET_NAME)

    print(f"Bucket: {BUCKET_NAME}")
    print(f"Collection: {collection}")
    print(f"Type: {asset_type}")
    print(f"Files found: {len(files)}")
    print()

    for file_path in files:
        filename = file_path.name.lower().replace(" ", "-")
        destination = f"collections/{collection}/{asset_type}/{filename}"

        if dry_run:
            print("DRY RUN:", file_path, "->", f"gs://{BUCKET_NAME}/{destination}")
            continue

        blob = bucket.blob(destination)

        if not overwrite and blob.exists():
            print("SKIP exists:", destination)
            continue

        guessed_type, _ = mimetypes.guess_type(str(file_path))
        if guessed_type:
            blob.content_type = guessed_type

        blob.upload_from_filename(str(file_path))
        print("UPLOADED:", file_path, "->", f"gs://{BUCKET_NAME}/{destination}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", required=True)
    parser.add_argument("--type", required=True, choices=sorted(VALID_TYPES))
    parser.add_argument("--src", required=True)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()

    upload_folder(
        args.collection,
        args.type,
        args.src,
        overwrite=args.overwrite,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
