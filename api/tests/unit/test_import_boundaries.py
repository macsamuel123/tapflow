"""Layering rules from CLAUDE.md: only app/payments imports stripe; SQL only in repositories."""

import ast
from pathlib import Path

APP = Path(__file__).resolve().parents[2] / "app"


def _modules() -> list[tuple[Path, ast.Module]]:
    return [(p, ast.parse(p.read_text(), filename=str(p))) for p in sorted(APP.rglob("*.py"))]


def _imports_stripe(tree: ast.Module) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import) and any(
            a.name == "stripe" or a.name.startswith("stripe.") for a in node.names
        ):
            return True
        if (
            isinstance(node, ast.ImportFrom)
            and node.module
            and (node.module == "stripe" or node.module.startswith("stripe."))
        ):
            return True
    return False


def test_only_payments_imports_stripe() -> None:
    offenders = [
        str(p.relative_to(APP))
        for p, tree in _modules()
        if _imports_stripe(tree) and "payments" not in p.relative_to(APP).parts[:1]
    ]
    assert offenders == []
    # And the payments package really is where it lives.
    assert any(_imports_stripe(t) for p, t in _modules() if p.parent.name == "payments")


# db.py runs the health ping; scripts/ is a dev CLI (make qr-urls).
_SQL_ALLOWED = {"repositories", "db.py", "scripts"}


def test_sql_only_in_repositories() -> None:
    offenders = []
    for p, tree in _modules():
        if p.relative_to(APP).parts[0] in _SQL_ALLOWED:
            continue
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in {"execute", "executemany"}
            ):
                offenders.append(f"{p.relative_to(APP)}:{node.lineno}")
    assert offenders == []
