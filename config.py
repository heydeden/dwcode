import json, os, pathlib, shutil

PACKAGE_DIR = pathlib.Path(__file__).parent.absolute()
DWCODE_CONFIG = pathlib.Path.home() / ".config" / "dwcode" / "config.json"
SKILLS_DIR = pathlib.Path.home() / ".config" / "dwcode" / "skills"
AGENTS_DIRS = [
    pathlib.Path.home() / ".config" / "dwcode" / "agents",
    pathlib.Path("/home/userland/.config/dwcode/agents"),
    pathlib.Path("/root/.config/dwcode/agents"),
]
DATA_DIR = PACKAGE_DIR / "dwcode_data"

DEFAULT = {
    "base_url": "http://127.0.0.1:20128/v1",
    "api_key": "",
    "model": "Gratis"
}

def _ensure_data():
    user_dir = pathlib.Path.home() / ".config" / "dwcode"
    skills_dest = user_dir / "skills"
    agents_dest = user_dir / "agents"

    if not skills_dest.exists() and (DATA_DIR / "skills").exists():
        skills_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(DATA_DIR / "skills", skills_dest, dirs_exist_ok=True)

    if not agents_dest.exists() and (DATA_DIR / "agents").exists():
        agents_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(DATA_DIR / "agents", agents_dest, dirs_exist_ok=True)

def load():
    _ensure_data()

    # Load from file
    file_cfg = {}
    if DWCODE_CONFIG.exists():
        file_cfg = json.loads(DWCODE_CONFIG.read_text())

    # Merge: file overrides DEFAULT, env overrides file
    cfg = {**DEFAULT, **file_cfg}

    # Environment variables override everything (except CLI --flags handled in main.py)
    env_key = os.environ.get("DWCODE_API_KEY")
    env_url = os.environ.get("DWCODE_BASE_URL")
    env_model = os.environ.get("DWCODE_MODEL")

    if env_key:
        cfg["api_key"] = env_key
    if env_url:
        cfg["base_url"] = env_url
    if env_model:
        cfg["model"] = env_model

    return cfg

def save(cfg):
    DWCODE_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    DWCODE_CONFIG.write_text(json.dumps(cfg, indent=2))