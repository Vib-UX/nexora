# GitBook reference (condensed)

Canonical full text: [GitBook skill.md](https://1050631731-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FNkEGS7hzeqa35sMXQZ4X%2Fuploads%2F98DviOHe8vonzDstAxFA%2Fskill.md?alt=media&token=0a2d5fa2-ee75-4096-8309-22d66f337388)

## `.gitbook.yaml` (minimal)

```yaml
root: ./

structure:
  readme: ./docs/overview.md
  summary: ./SUMMARY.md

redirects:
  old-slug: docs/new-page.md
```

Paths are relative to `root`. For monorepos, put `.gitbook.yaml` in the synced subdirectory and set GitBook “Project directory” to that folder.

## `SUMMARY.md`

- First line: `# Summary` (or “Table of contents”).
- `## Heading` = sidebar group.
- `* [Title](path/to/file.md)` = page; indent with spaces for nesting.
- Do not reference the same `.md` file twice.

## Frontmatter (page top)

```yaml
---
description: SEO / preview text
icon: book-open
hidden: true
vars:
  key: value
layout:
  width: default
  title:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
---
```

Space-level variables: `.gitbook/vars.yaml`. Page vars: `vars:` in frontmatter. Expressions (in GitBook): `<code class="expression">space.vars.name</code>`.

## Custom blocks (cheat sheet)

**Tabs**

````markdown
{% tabs %}
{% tab title="A" %}
Content A
{% endtab %}
{% tab title="B" %}
Content B
{% endtab %}
{% endtabs %}
````

**Hints** — styles: `info`, `warning`, `danger`, `success`

```markdown
{% hint style="info" %}
Callout text.
{% endhint %}
```

**Stepper**

```markdown
{% stepper %}
{% step %}
## Step one
Body.
{% endstep %}
{% endstepper %}
```

**Columns** (max two)

```markdown
{% columns %}
{% column %}
Left
{% endcolumn %}
{% column %}
Right
{% endcolumn %}
{% endcolumns %}
```

**Expandable**

```markdown
<details>
<summary>Title</summary>
Hidden body.
</details>
```

**Code with title**

````markdown
{% code title="file.rs" %}
```rust
fn main() {}
```
{% endcode %}
````

## Assets and includes

- Uploaded assets: `.gitbook/assets/`; reference like `![alt](../.gitbook/assets/name.svg)` from pages (adjust relative path from page location).
- Reusable blocks: `{% include "/reusable-content/rc…" %}` (IDs from GitBook UI).

## OpenAPI

Specs are not embedded in markdown; upload via GitBook UI, CLI, or API, then reference with `{% openapi … %}`.

## Pitfalls

- Same file twice in `SUMMARY.md` breaks navigation.
- Mixing tabs and spaces for indentation in `SUMMARY.md` causes issues; use spaces only.
- Close every `{% … %}` block explicitly.
