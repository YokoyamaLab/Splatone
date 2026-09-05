# Splatone implementation paper — SoftwareX format

This directory contains the Splatone implementation paper prepared with the Elsevier `elsarticle` class used for SoftwareX submissions.

## Files

- `main.tex` — SoftwareX/Elsevier entry point.
- `main-body.tex` — manuscript body included by `main.tex`.
- `main-jlreq.tex` — previous manuscript source preserved verbatim during the format migration.
- `references.bib` — bibliography database.
- `figures/` — manuscript figures.

The current `main.tex` deliberately reuses the manuscript body split out from `main-jlreq.tex` so that applying the SoftwareX style does not silently rewrite the paper. Keeping the extracted body in `main-body.tex` lets LaTeX read `listings` and other verbatim-like content with the correct catcodes. The SoftwareX front matter, keywords, code metadata table, and Elsevier numbered bibliography style are defined in `main.tex`.

## Compile

The manuscript currently contains Japanese text, so use LuaLaTeX rather than pdfLaTeX.

```sh
latexmk -pdf main.tex
```

Or run the equivalent commands manually:

```sh
lualatex main.tex
bibtex main
lualatex main.tex
lualatex main.tex
```

On Overleaf, select **LuaLaTeX** as the compiler. The `elsarticle` class and `elsarticle-num` bibliography style are included in normal TeX Live / Overleaf installations.

## Before SoftwareX submission

The manuscript body is still Japanese. Before submission to SoftwareX, translate and edit the manuscript in English, replace the remaining `TODO` in the Code metadata table (support/corresponding-author email), and review the manuscript structure against the current SoftwareX Guide for Authors.
