from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text
from prompt_toolkit import PromptSession
from prompt_toolkit.history import InMemoryHistory
from prompt_toolkit.styles import Style as PTStyle
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.filters import has_completions
from config import AGENTS_DIRS

console = Console()

SLASH_COMMANDS = ["/plan", "/build", "/mode", "/skill", "/skills", "/unskill", "/agent", "/agents", "/default", "/clear", "/help", "/exit"]

def _build_completions():
    words = list(SLASH_COMMANDS)
    seen = set()
    for d in AGENTS_DIRS:
        if d.exists():
            for f in sorted(d.glob("*.md")):
                name = "@" + f.stem
                if name not in seen:
                    seen.add(name)
                    words.append(name)
    return words

ALL_WORDS = _build_completions()

def reload_completions():
    ALL_WORDS[:] = _build_completions()

class TriggerCompleter(Completer):
    def get_completions(self, document, complete_event):
        word = document.get_word_before_cursor(WORD=True)
        if not word or not word.startswith(('/', '@')):
            return
        for w in ALL_WORDS:
            if w.startswith(word):
                yield Completion(w, start_position=-len(word))

pt_style = PTStyle.from_dict({
    "prompt": "ansicyan bold",
})

kb = KeyBindings()

@kb.add("enter", filter=has_completions)
def _(event):
    b = event.app.current_buffer
    if b.complete_state:
        b.complete_state = None

@kb.add("enter", filter=~has_completions)
def _(event):
    event.app.current_buffer.validate_and_handle()

_session = None
_prompt_mode = "plan"

def _get_session():
    global _session
    if _session is None:
        _session = PromptSession(
            history=InMemoryHistory(),
            style=pt_style,
            completer=TriggerCompleter(),
            complete_while_typing=True,
            key_bindings=kb,
        )
    return _session

def set_prompt_mode(mode):
    global _prompt_mode
    _prompt_mode = mode

PROMPT_EMOJIS = {"plan": "🤔", "build": "🔧"}

def get_input():
    try:
        emoji = PROMPT_EMOJIS.get(_prompt_mode, "❯")
        return _get_session().prompt(f"{emoji} {_prompt_mode} > ").strip()
    except (EOFError, KeyboardInterrupt):
        return None

def show_header(mode, model):
    console.print(Panel(
        f"Model: [bold]{model}[/bold]          Mode: [green]● {mode.upper()}[/green]",
        title="[bold]DWCode[/bold]",
        border_style="blue",
        padding=(0, 1),
    ))

class AssistantStream:
    def __init__(self):
        self.text = ""

    def __enter__(self):
        return self

    def __exit__(self, *args):
        if self.text:
            console.print(Panel(
                Markdown(self.text.strip()),
                title="[bold blue]DWCode[/bold blue]",
                border_style="blue",
            ))

    def update_text(self, delta):
        self.text += delta

def show_status(msg):
    console.print(Panel(
        Text(msg),
        title="⏳",
        border_style="dim",
        padding=(0, 1),
    ))

def show_info(msg):
    console.print(Panel(
        Text(msg),
        title="ℹ️",
        border_style="dim",
        padding=(0, 1),
    ))

def show_error(msg):
    console.print(Panel(
        Text(str(msg), style="red bold"),
        title="[bold red]Error[/bold red]",
        border_style="red",
        padding=(0, 1),
    ))