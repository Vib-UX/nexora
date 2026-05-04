---
name: gitbook
description: >-
  Edits GitBook-synced markdown in this repo: SUMMARY.md navigation, .gitbook.yaml,
  frontmatter, and GitBook custom blocks ({% hint %}, {% tabs %}, etc.). Use when
  the user mentions GitBook, Git Sync, SUMMARY.md, .gitbook.yaml, or publishing
  docs from this repository to a GitBook space.
disable-model-invocation: true
---

# GitBook (Nexora repo)

## When to use

- Adding, renaming, or reordering pages in the published book → update [`SUMMARY.md`](../../../SUMMARY.md) and keep paths consistent with [`.gitbook.yaml`](../../../.gitbook.yaml).
- Editing product or technical docs under `docs/` that are linked from the book.
- Inserting GitBook-only syntax (hints, tabs, steppers, columns) that plain GitHub preview may not render.

## Workflow (this repo)

1. Read [`SUMMARY.md`](../../../SUMMARY.md) to see the sidebar hierarchy and target paths.
2. Read [`.gitbook.yaml`](../../../.gitbook.yaml) for `root`, `structure.readme`, `structure.summary`, and redirects.
3. Prefer **one markdown file per URL**: do not list the same `.md` twice in `SUMMARY.md`.
4. Use **relative links** between pages (e.g. `[Architecture](docs/architecture.md)` from the landing page).
5. Keep the GitBook homepage path in sync with `.gitbook.yaml` `structure.readme` (currently `docs/overview.md`).

## Git sync

- Treat **`SUMMARY.md` in Git** as the source of truth for navigation on doc branches unless the team agrees otherwise.
- After GitBook UI edits, review auto-commits for TOC conflicts.

## Syntax and configuration detail

For TOC rules, `.gitbook.yaml` shape, frontmatter fields, and custom block examples, read [reference.md](reference.md).

## Canonical upstream skill

Full GitBook authoring reference (external copy of the space skill):  
https://1050631731-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FNkEGS7hzeqa35sMXQZ4X%2Fuploads%2F98DviOHe8vonzDstAxFA%2Fskill.md?alt=media&token=0a2d5fa2-ee75-4096-8309-22d66f337388
