from __future__ import annotations

import importlib.util
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "doc_audit.py"
SPEC = importlib.util.spec_from_file_location("doc_audit", MODULE_PATH)
doc_audit = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules["doc_audit"] = doc_audit
SPEC.loader.exec_module(doc_audit)


FRONTMATTER = """---
title: Test Doc
tier: meta
status: living
updated: 2026-08-16
audited: 2026-08-16
related:
---
"""


class DocAuditTests(unittest.TestCase):
    def make_root(self) -> Path:
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        return root

    def write(self, root: Path, path: str, text: str) -> None:
        target = root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def severities(self, findings):
        return [finding.severity for finding in findings]

    def messages(self, findings):
        return "\n".join(finding.line() for finding in findings)

    def test_missing_required_path_is_error(self):
        root = self.make_root()
        findings = doc_audit.audit(root, required_paths=["docs/PROJECT_VISION.md"])
        self.assertIn("ERROR", self.severities(findings))
        self.assertIn("required path is missing", self.messages(findings))

    def test_missing_frontmatter_is_error(self):
        root = self.make_root()
        self.write(root, "docs/PROJECT_VISION.md", "# No frontmatter\n")
        findings = doc_audit.audit(root, required_paths=["docs/PROJECT_VISION.md"])
        self.assertIn("missing YAML frontmatter", self.messages(findings))

    def test_broken_local_link_is_error(self):
        root = self.make_root()
        self.write(root, "docs/PROJECT_VISION.md", FRONTMATTER + "# Test\n[bad](MISSING.md)\n")
        findings = doc_audit.audit(root, required_paths=["docs/PROJECT_VISION.md"])
        self.assertIn("broken local markdown link", self.messages(findings))

    def test_next_requires_start_here(self):
        root = self.make_root()
        self.write(root, "docs/NEXT.md", FRONTMATTER + "# NEXT\n")
        findings = doc_audit.audit(root, required_paths=["docs/NEXT.md"])
        self.assertIn("missing literal `## START HERE`", self.messages(findings))

    def test_adr_metadata_is_checked(self):
        root = self.make_root()
        self.write(root, "docs/decisions/0001-test.md", FRONTMATTER + "# ADR\n")
        findings = doc_audit.audit(root, required_paths=["docs/decisions/0001-test.md"])
        self.assertIn("frontmatter adr must be 0001", self.messages(findings))

    def test_map_drift_is_error(self):
        root = self.make_root()
        self.write(root, "docs/PROJECT_VISION.md", FRONTMATTER + "# Test\n")
        self.write(root, "docs/MAP.md", "stale\n")
        findings = doc_audit.audit(root, required_paths=["docs/PROJECT_VISION.md", "docs/MAP.md"])
        self.assertIn("generated map is out of date", self.messages(findings))

    def test_write_map_then_check_passes_for_minimal_docs(self):
        root = self.make_root()
        self.write(root, "docs/PROJECT_VISION.md", FRONTMATTER + "# Test\n")
        self.write(root, "docs/DOC_SPEC.md", FRONTMATTER + "# Doc Spec\n")
        doc_audit.write_map(root)
        findings = doc_audit.audit(root, required_paths=["docs/PROJECT_VISION.md", "docs/DOC_SPEC.md", "docs/MAP.md"])
        self.assertNotIn("ERROR", self.severities(findings), self.messages(findings))

    def test_map_check_ignores_date_only_drift(self):
        root = self.make_root()
        self.write(root, "docs/PROJECT_VISION.md", FRONTMATTER + "# Test\n")
        self.write(root, "docs/DOC_SPEC.md", FRONTMATTER + "# Doc Spec\n")
        old_map = doc_audit.generate_map(root, updated="2026-01-01")
        self.write(root, "docs/MAP.md", old_map)
        findings = doc_audit.audit(root, required_paths=["docs/PROJECT_VISION.md", "docs/DOC_SPEC.md", "docs/MAP.md"])
        self.assertNotIn("generated map is out of date", self.messages(findings))


if __name__ == "__main__":
    unittest.main()
