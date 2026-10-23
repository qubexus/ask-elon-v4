"""File storage for uploaded documents.

STORAGE_BACKEND=local (default): files are kept on disk in UPLOAD_DIR (default backend/uploads/).
STORAGE_BACKEND=s3: any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2...).
Files are never public – they are streamed through the API after checking the user's login.
"""
import os
from pathlib import Path
from typing import Tuple

BACKEND = (os.environ.get("STORAGE_BACKEND") or "local").strip().lower()
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR") or Path(__file__).parent / "uploads").resolve()
S3_BUCKET = os.environ.get("S3_BUCKET", "")
_s3 = None


class ObjectNotFound(Exception):
    pass


def _client():
    global _s3
    if _s3 is None:
        import boto3
        _s3 = boto3.client(
            "s3",
            endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
            aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID") or None,
            aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY") or None,
            region_name=os.environ.get("S3_REGION") or "auto",
        )
    return _s3


def _local_path(path: str) -> Path:
    p = (UPLOAD_DIR / path).resolve()
    if UPLOAD_DIR not in p.parents:
        raise ObjectNotFound(path)
    return p


def init_storage():
    if BACKEND == "s3":
        if not S3_BUCKET:
            raise RuntimeError("STORAGE_BACKEND=s3 but S3_BUCKET is empty")
        _client().head_bucket(Bucket=S3_BUCKET)
    elif BACKEND == "local":
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    else:
        raise RuntimeError(f"Unknown STORAGE_BACKEND={BACKEND!r} (use 'local' or 's3')")


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if BACKEND == "s3":
        _client().put_object(Bucket=S3_BUCKET, Key=path, Body=data, ContentType=content_type)
    else:
        p = _local_path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    return {"path": path, "size": len(data)}


def get_object(path: str) -> Tuple[bytes, str]:
    if BACKEND == "s3":
        try:
            r = _client().get_object(Bucket=S3_BUCKET, Key=path)
        except Exception as e:  # botocore NoSuchKey / 404
            raise ObjectNotFound(path) from e
        return r["Body"].read(), r.get("ContentType", "application/octet-stream")
    p = _local_path(path)
    if not p.is_file():
        raise ObjectNotFound(path)
    return p.read_bytes(), "application/octet-stream"
