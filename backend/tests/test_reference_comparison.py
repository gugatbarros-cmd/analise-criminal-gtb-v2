"""Comparação local de seis fontes usa apenas agregados e falha com divergências."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "fixtures" / "synthetic" / "reference-checks.json"
SCRIPT = ROOT / "scripts" / "compare-reference.py"


def run(manifest: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run([sys.executable, str(SCRIPT), str(manifest)], cwd=ROOT,
                          text=True, capture_output=True, check=False)


def test_reference_comparison_passes_all_synthetic_checks():
    result = run(MANIFEST)
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["status"] == "passed"
    assert len(report["imports"]) == 6
    assert all(check["passed"] for check in report["checks"])
    assert "Pessoa Fictícia" not in result.stdout


def test_reference_comparison_reports_mismatch_and_hash_error(tmp_path):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for source in manifest["sources"]:
        source["path"] = str(MANIFEST.parent / source["path"])
    manifest["checks"][0]["expected"] += 1
    comparison = tmp_path / "comparison.json"
    comparison.write_text(json.dumps(manifest), encoding="utf-8")
    mismatch = run(comparison)
    assert mismatch.returncode == 1, mismatch.stderr
    assert json.loads(mismatch.stdout)["status"] == "mismatch"

    manifest["sources"][0]["sha256"] = "0" * 64
    comparison.write_text(json.dumps(manifest), encoding="utf-8")
    invalid = run(comparison)
    assert invalid.returncode == 2
    assert "SHA-256 divergente" in invalid.stderr
