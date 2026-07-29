---
name: md2pdf
description: Convert Markdown (.md) files to PDF using python3-reportlab. Supports headings, code blocks, tables, lists, bold/italic, inline code, links, and horizontal rules.
---

# Markdown to PDF Converter

## Prerequisites

Ensure `python3-reportlab` is installed:

```bash
apt-get install -y python3-reportlab 2>/dev/null
```

Script location: `{SKILL_DIR}/md2pdf.py`

## Usage

```bash
python3 {SKILL_DIR}/md2pdf.py input.md output.pdf
```

## Supported Markdown

| Element | Rendered As |
|---------|-------------|
| `# Heading` | H1 — large bold |
| `## Heading` | H2 — medium bold |
| `### Heading` | H3 — small bold |
| `` `code` `` | Inline monospace |
| ``` ```code``` ``` | Code block — monospace, gray bg |
| `**bold**` | Bold |
| `*italic*` | Italic |
| `[link](url)` | Clickable link (blue) |
| `- list` | Bullet list |
| `1. list` | Numbered list |
| `\| table \|` | Table with header row, striped |
| `---` | Horizontal rule |
| paragraph | Auto-wrapped text |

## Examples

```bash
# Convert a single file
python3 /root/.config/opencode/skills/md2pdf/md2pdf.py report.md report.pdf

# Convert multiple files
for f in *.md; do
    python3 /root/.config/opencode/skills/md2pdf/md2pdf.py "$f" "${f%.md}.pdf"
done
```

## Notes

- Input `.md` file is **never modified**
- Output PDF uses A4 page size, 20mm margins
- Table header rows have dark blue background with white text
- Code blocks use 7.8pt Courier with light gray background
- Links are rendered in blue (clickable in PDF viewers)
