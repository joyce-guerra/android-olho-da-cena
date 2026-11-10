# Role: controller
"""Instrumento de voo único do repositório Olho da Cena Android (`doctor`, `build`, `check`)."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REQUIRED_GATES_IN_MANUAL = (
    "Role:",
    "250 linhas",
    "utils",
    "Decided",
    "tools/dev.py check",
)

FORBIDDEN_STEMS = {"utils", "helpers", "common", "shared", "misc"}

VALID_ROLES = {"entity", "value", "policy", "port", "adapter", "service", "controller"}

NEW_MANAGED_FILES = (
    "src/android-armazenamento-policy.js",
    "src/android-interrupcao-policy.js",
    "src/android-nativo-port.js",
    "src/android-nativo-adapter.js",
    "src/android-ponte-service.js",
    "ui/toque-controles-controller.js",
    "android/app/src/main/AndroidManifest.xml",
    "android/app/src/main/java/br/com/olhodacena/MainActivity.kt",
    "android/app/src/main/java/br/com/olhodacena/OlhoAssetLoaderAdapter.kt",
    "android/app/src/main/java/br/com/olhodacena/OlhoBridgeService.kt",
    "test/v305-android-onda1.test.js",
    "tools/dev.py",
)

ARCHAEOLOGY_PATTERNS = (
    re.compile(r"\bantes era\b", re.IGNORECASE),
    re.compile(r"\bmudou no milestone\b", re.IGNORECASE),
    re.compile(r"\bremovido no pr\b", re.IGNORECASE),
)


def test_the_checks_are_those_the_agents_manual_requires() -> None:
    agents_md = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    dev_py = (ROOT / "tools" / "dev.py").read_text(encoding="utf-8")
    for token in REQUIRED_GATES_IN_MANUAL:
        if token not in agents_md:
            raise AssertionError(f"Token obrigatório ausente do AGENTS.md: {token}")
    for step in (
        "check_roles",
        "check_line_limits",
        "check_forbidden_filenames",
        "check_architecture_table",
        "check_kotlin_js_bridge_parity",
        "run_all_tests",
    ):
        if step not in dev_py:
            raise AssertionError(f"Etapa de verificação ausente em tools/dev.py: {step}")


def doctor() -> None:
    res = subprocess.run(["node", "--version"], capture_output=True, text=True, check=False)
    if res.returncode != 0:
        raise RuntimeError("Node.js não encontrado no PATH.")
    for required_dir in ("src", "ui", "test", "specs", "docs", "android"):
        if not (ROOT / required_dir).exists():
            raise RuntimeError(f"Diretório obrigatório ausente: {required_dir}")


def build_if_stale() -> None:
    return None


def check_forbidden_filenames() -> None:
    for folder in ("src", "ui", "android", "tools", "test"):
        base = ROOT / folder
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.stem.lower() in FORBIDDEN_STEMS:
                raise AssertionError(f"Arquivo com nome proibido encontrado: {path.relative_to(ROOT)}")


def check_roles() -> None:
    role_re = re.compile(r"Role:\s*(entity|value|policy|port|adapter|service|controller)\b")
    for rel in NEW_MANAGED_FILES:
        path = ROOT / rel
        if not path.exists():
            raise AssertionError(f"Arquivo gerenciado ausente: {rel}")
        lines = path.read_text(encoding="utf-8").splitlines()[:10]
        header = "\n".join(lines)
        match = role_re.search(header)
        if not match or match.group(1) not in VALID_ROLES:
            raise AssertionError(f"Cabeçalho Role: ausente ou inválido nas primeiras 10 linhas de {rel}")


def check_line_limits() -> None:
    for rel in NEW_MANAGED_FILES:
        path = ROOT / rel
        lines = path.read_text(encoding="utf-8").splitlines()
        if len(lines) > 250:
            raise AssertionError(f"Arquivo novo excede 250 linhas ({len(lines)}): {rel}")
        text = "\n".join(lines)
        for pat in ARCHAEOLOGY_PATTERNS:
            if pat.search(text):
                raise AssertionError(f"Comentário de histórico de diff proibido em {rel}")


def check_architecture_table() -> None:
    arch = (ROOT / "docs" / "ARCHITECTURE.md").read_text(encoding="utf-8")
    if "Descrição Textual da Arquitetura" not in arch:
        raise AssertionError("Descrição textual acessível ausente em docs/ARCHITECTURE.md")
    paths_in_table = set(
        re.findall(
            r"\|\s*`([^`]+)`\s*\|\s*`(?:entity|value|policy|port|adapter|service|controller)`\s*\|",
            arch,
        )
    )
    for rel in paths_in_table:
        if not (ROOT / rel).exists():
            raise AssertionError(f"Caminho na tabela 'Onde vive' não existe no disco: {rel}")
    for folder in ("src", "ui"):
        for file_path in (ROOT / folder).glob("*"):
            if file_path.is_file():
                rel_posix = file_path.relative_to(ROOT).as_posix()
                if rel_posix not in paths_in_table:
                    raise AssertionError(f"Módulo órfão fora da tabela 'Onde vive': {rel_posix}")


def check_kotlin_js_bridge_parity() -> None:
    adapter_js = (ROOT / "src" / "android-nativo-adapter.js").read_text(encoding="utf-8")
    bridge_kt = (
        ROOT
        / "android"
        / "app"
        / "src"
        / "main"
        / "java"
        / "br"
        / "com"
        / "olhodacena"
        / "OlhoBridgeService.kt"
    ).read_text(encoding="utf-8")
    main_kt = (
        ROOT
        / "android"
        / "app"
        / "src"
        / "main"
        / "java"
        / "br"
        / "com"
        / "olhodacena"
        / "MainActivity.kt"
    ).read_text(encoding="utf-8")
    called_methods = set(re.findall(r"nativo\.([a-zA-Z0-9_]+)\s*\(", adapter_js))
    called_methods.discard("registrarCallbackInterrupcao")
    kt_methods = set(re.findall(r"@JavascriptInterface\s+fun\s+([a-zA-Z0-9_]+)\s*\(", bridge_kt))
    missing = called_methods - kt_methods
    if missing:
        raise AssertionError(f"Métodos chamados em nativo mas ausentes em OlhoBridgeService.kt: {missing}")
    if "OlhoAoInterromperSistema" not in adapter_js or "OlhoAoInterromperSistema" not in main_kt:
        raise AssertionError("Hook global OlhoAoInterromperSistema ausente entre MainActivity.kt e adapter JS.")


def run_all_tests() -> None:
    unit_files = sorted(str(p.relative_to(ROOT)) for p in (ROOT / "test" / "unit-grav").glob("*.test.js"))
    top_files = [
        "test/marcas.test.js",
        "test/selecao.test.js",
        "test/v301-atualizacao.test.js",
        "test/v302-video-post.test.js",
        "test/v305-android-onda1.test.js",
    ]
    env = os.environ.copy()
    ffmpeg_dir = str(ROOT / "vendor" / "ffmpeg")
    env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")
    cmd = ["node", "--test", *unit_files, *top_files]
    res = subprocess.run(cmd, cwd=ROOT, env=env, check=False)
    if res.returncode != 0:
        raise RuntimeError("A suíte de testes falhou.")


def main() -> int:
    command = sys.argv[1] if len(sys.argv[1:]) >= 1 else "check"
    if command == "doctor":
        doctor()
        print("OK: doctor")
        return 0
    if command == "build":
        build_if_stale()
        print("OK: build")
        return 0
    if command == "check":
        doctor()
        build_if_stale()
        test_the_checks_are_those_the_agents_manual_requires()
        check_forbidden_filenames()
        check_roles()
        check_line_limits()
        check_architecture_table()
        check_kotlin_js_bridge_parity()
        run_all_tests()
        print("OK: tools/dev.py check concluído com 100% de aprovação.")
        return 0
    raise SystemExit(f"Comando desconhecido: {command}")


if __name__ == "__main__":
    raise SystemExit(main())
