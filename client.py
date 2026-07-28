import json, re, time
from openai import OpenAI, APIError, AuthenticationError, APIConnectionError

def _clean_error(raw):
    s = str(raw)[:500]
    m = re.search(r'"message":"([^"]+)"', s)
    if m:
        return m.group(1)
    m = re.search(r"'message': '([^']+)'", s)
    if m:
        return m.group(1)
    return s[:200]

class LLMClient:
    def __init__(self, base_url, api_key, model):
        self.base_url = base_url
        self.api_key = api_key
        self.model = model
        self.client = OpenAI(base_url=base_url, api_key=api_key)

    def check(self):
        try:
            self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
                stream=False,
            )
            return True, ""
        except AuthenticationError:
            return False, "API key ditolak (401)"
        except APIConnectionError:
            return False, f"Server tidak bisa dihubungi"
        except APIError as e:
            if e.status_code == 401:
                return False, "API key ditolak (401)"
            return True, ""
        except Exception as e:
            return False, _clean_error(e)[:200]

    def _build_tools(self, tool_schemas):
        if not tool_schemas:
            return None
        return [{"type": "function", "function": s} for s in tool_schemas]

    def stream(self, messages, tool_schemas=None, on_text=None, on_tool_start=None):
        tools = self._build_tools(tool_schemas)
        kwargs = dict(model=self.model, messages=messages, stream=True)
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        retries = 5
        for attempt in range(retries):
            try:
                response = self.client.chat.completions.create(**kwargs)
                break
            except AuthenticationError:
                yield {"type": "error", "content": "⚠️ API key ditolak (401)"}
                return
            except APIConnectionError:
                if attempt < retries - 1:
                    time.sleep(3)
                    continue
                yield {"type": "error", "content": f"⚠️ Gagal terhubung ke {self.base_url}"}
                return
            except APIError as e:
                if e.status_code in (400, 408, 429, 500, 502, 503) and attempt < retries - 1:
                    delay = 3 * (2 ** attempt)
                    time.sleep(delay)
                    continue
                msg = _clean_error(e.message)
                yield {"type": "error", "content": f"⚠️ {msg} (HTTP {e.status_code}), coba lagi nanti"}
                return
            except Exception as e:
                if attempt < retries - 1:
                    time.sleep(3)
                    continue
                yield {"type": "error", "content": f"⚠️ {_clean_error(e)}"}
                return

        text = ""
        tool_calls = {}

        for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            finish = chunk.choices[0].finish_reason

            if delta and delta.content:
                text += delta.content
                yield {"type": "text_delta", "content": delta.content}
                if on_text:
                    on_text(delta.content)

            if delta and delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls:
                        tool_calls[idx] = {"id": "", "function": {"name": "", "arguments": ""}}
                    if tc.id:
                        tool_calls[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls[idx]["function"]["name"] += tc.function.name
                        if tc.function.arguments:
                            tool_calls[idx]["function"]["arguments"] += tc.function.arguments

            if finish == "tool_calls":
                break

        if tool_calls:
            calls = list(tool_calls.values())
            for c in calls:
                try:
                    c["function"]["arguments"] = json.loads(c["function"]["arguments"])
                except json.JSONDecodeError:
                    c["function"]["arguments"] = {}
            yield {"type": "tool_calls", "calls": calls}
            if on_tool_start:
                on_tool_start(calls)
        else:
            yield {"type": "done", "content": text}
