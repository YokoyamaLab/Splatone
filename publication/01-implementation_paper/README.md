# Splatone implementation paper — SoftwareX format

This directory contains the Splatone implementation paper prepared with the Elsevier `elsarticle` class used for SoftwareX submissions.

## Files

- `main.tex` — SoftwareX/Elsevier entry point.
- `main-jlreq.tex` — previous manuscript source preserved verbatim during the format migration.
- `main-jlreq.pdf` — PDF corresponding to the previous layout.
- `references.bib` — bibliography database.
- `figures/` — manuscript figures.

The current `main.tex` deliberately reuses the manuscript body from `main-jlreq.tex` so that applying the SoftwareX style does not silently rewrite the paper. The SoftwareX front matter, keywords, code metadata table, and Elsevier numbered bibliography style are defined in `main.tex`.

## Compile

The manuscript currently contains Japanese text, so use LuaLaTeX rather than pdfLaTeX.

```sh
lualatex main.tex
bibtex main
lualatex main.tex
lualatex main.tex
```

On Overleaf, select **LuaLaTeX** as the compiler. The `elsarticle` class and `elsarticle-num` bibliography style are included in normal TeX Live / Overleaf installations.

## Before SoftwareX submission

The manuscript body is still Japanese. Before submission to SoftwareX, translate and edit the manuscript in English, replace the remaining `TODO` in the Code metadata table (support/corresponding-author email), and review the manuscript structure against the current SoftwareX Guide for Authors.
