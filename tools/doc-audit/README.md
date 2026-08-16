# Documentation Audit Tool

This tool is intentionally dependency-light because the product runtime has not been selected.

## Commands

Regenerate the map:

```bash
python3 tools/doc-audit/doc_audit.py --write-map
```

Check the repository:

```bash
python3 tools/doc-audit/doc_audit.py --check
```

Run tests:

```bash
python3 -m unittest discover tools/doc-audit/tests
```

On Windows, use `python` in place of `python3` if the `python3` launcher is unavailable.

## Scope

The checker validates foundation documentation structure. It does not validate product behavior, geometry, exports, UI, or physical fit.

