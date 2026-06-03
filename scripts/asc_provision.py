#!/usr/bin/env python3
"""App Store Connect API 로 배포(Distribution) 인증서 + App Store 프로비저닝 프로파일을
헤드리스로 생성한다. 기기 등록이 필요 없는 App Store 프로파일을 만들어 자동 서명의
"등록된 기기 없음" 문제를 우회한다.

출력(JSON, stdout 마지막 줄):
  {"identity": "Apple Distribution: ...", "p12_path": "...", "profile_path": "...",
   "profile_name": "...", "profile_uuid": "..."}

환경변수: ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_KEY_PATH, BUNDLE_ID
"""
import base64
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

import jwt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

API = "https://api.appstoreconnect.apple.com"


def fail(msg):
    print(f"REJECT: {msg}", file=sys.stderr)
    sys.exit(1)


def make_token(key_id, issuer_id, key_path):
    """ASC API JWT (ES256, 20분 유효)."""
    try:
        with open(key_path, "r") as f:
            private_key = f.read()
    except OSError as e:
        fail(f".p8 키 읽기 실패: {e}")
    now = int(time.time())
    payload = {"iss": issuer_id, "iat": now, "exp": now + 20 * 60, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": key_id, "typ": "JWT"})


def api(method, path, token, body=None):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        fail(f"API {method} {path} -> {e.code}: {detail}")


def main():
    key_id = os.environ.get("ASC_API_KEY_ID") or fail("ASC_API_KEY_ID 필요")
    issuer_id = os.environ.get("ASC_API_ISSUER_ID") or fail("ASC_API_ISSUER_ID 필요")
    key_path = os.environ.get("ASC_API_KEY_PATH") or fail("ASC_API_KEY_PATH 필요")
    bundle_id = os.environ.get("BUNDLE_ID") or fail("BUNDLE_ID 필요")
    out_dir = os.environ.get("OUT_DIR", os.path.join(os.path.dirname(__file__), "..", "build"))
    os.makedirs(out_dir, exist_ok=True)

    token = make_token(key_id, issuer_id, key_path)

    # --- 1) 기존 Distribution 인증서 재사용 (개인키가 없으면 새로 만들어야 하므로 항상 새로 생성) ---
    #     계정 인증서 한도(보통 2~3개)를 넘으면 콘솔에서 정리 필요.
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Anima Distribution")]))
        .sign(priv, hashes.SHA256())
    )
    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode()

    print("==> 배포 인증서 생성 (DISTRIBUTION)", file=sys.stderr)
    cert_resp = api("POST", "/v1/certificates", token, {
        "data": {"type": "certificates",
                 "attributes": {"certificateType": "DISTRIBUTION", "csrContent": csr_pem}}
    })
    cert_attr = cert_resp["data"]["attributes"]
    cert_id = cert_resp["data"]["id"]
    cert_der = base64.b64decode(cert_attr["certificateContent"])
    cert = x509.load_der_x509_certificate(cert_der)
    identity_name = cert.subject.rfc4514_string()
    # 서명 ID 표시명은 보통 "Apple Distribution: <팀명> (<TeamID>)" 형태의 CN
    cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value

    # --- 2) p12 (개인키 + 인증서) 작성 ---
    p12_path = os.path.abspath(os.path.join(out_dir, "dist.p12"))
    p12_bytes = pkcs12.serialize_key_and_certificates(
        name=b"anima-dist", key=priv, cert=cert, cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(b"anima"),
    )
    with open(p12_path, "wb") as f:
        f.write(p12_bytes)

    # --- 3) Bundle ID 리소스 조회 ---
    bid = api("GET", f"/v1/bundleIds?filter[identifier]={bundle_id}&limit=1", token)
    if not bid.get("data"):
        fail(f"Bundle ID 미등록: {bundle_id} (App ID 를 먼저 만들어야 함)")
    bundle_resource_id = bid["data"][0]["id"]

    # --- 4) App Store 프로파일 생성 (기기 불필요) ---
    print("==> App Store 프로파일 생성 (IOS_APP_STORE)", file=sys.stderr)
    prof_name = "Anima App Store (auto)"
    prof_resp = api("POST", "/v1/profiles", token, {
        "data": {
            "type": "profiles",
            "attributes": {"name": prof_name, "profileType": "IOS_APP_STORE"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": bundle_resource_id}},
                "certificates": {"data": [{"type": "certificates", "id": cert_id}]},
            },
        }
    })
    prof_attr = prof_resp["data"]["attributes"]
    prof_uuid = prof_attr["uuid"]
    prof_bytes = base64.b64decode(prof_attr["profileContent"])
    profiles_dir = os.path.expanduser("~/Library/MobileDevice/Provisioning Profiles")
    os.makedirs(profiles_dir, exist_ok=True)
    profile_path = os.path.join(profiles_dir, f"{prof_uuid}.mobileprovision")
    with open(profile_path, "wb") as f:
        f.write(prof_bytes)

    print(json.dumps({
        "identity": cn,
        "p12_path": p12_path,
        "p12_password": "anima",
        "profile_path": profile_path,
        "profile_name": prof_name,
        "profile_uuid": prof_uuid,
        "cert_id": cert_id,
    }))


if __name__ == "__main__":
    main()
