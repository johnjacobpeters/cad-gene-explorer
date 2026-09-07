# CAD Gene Explorer

An interactive, student-facing website for exploring RNA-seq data from CAD (neuron-like)
mouse cells, plus the ability for students to load and analyse **their own** data in the
browser.

Everything is static: no server, database or build step.

```
cad-explorer/
  index.html                        - the page
  style.css                         - styling
  app.js                            - interactivity (multi-dataset engine + upload analysis)
  data.js                           - built-in gene data (generated, ~2.0 MB)
  example_undiff_vs_diff.csv        - real example file for the upload tool
  example_practice_SIMULATED.csv    - simulated replicates for practising the statistics
  GSE291553_Diff_v_Undiff2.xlsx     - published data downloaded from GEO (build input)
  enrichment.json                   - GO/KEGG + STRING results (generated)
  build_explorer_data.py            - regenerates data.js and the example files
  enrich_explorer.py                - regenerates enrichment.json (Enrichr + STRING APIs)
```

## The datasets

| # | Dataset | Design | Statistics | Plot |
|---|---|---|---|---|
| ① **default** | **Cevallos et al. 2025**, published | 3 dishes each | DESeq2 (authors') | Volcano |
| ② | Whatever the student uploads | their choice | Welch t-test + BH (if replicates) | Volcano or MA |
| ③ **backup data** | This lab: undifferentiated vs differentiated | 1 dish each | none possible | MA plot |

Students switch datasets with the chips at the top; the whole page adapts: plot type,
themes, wording.

The pairing is the pedagogical core: the backup data has **no replicates and no p-values**,
and the published study is an **independent study of the same experiment that does**. Several
themes invite students to check a finding in the backup data against the published one, and the
backup tab shows that comparison automatically. The headline case is `Id3` (an inhibitor of
differentiation): down ~11× in the backup data, down ~288× at p ≈ 4e-32 published. Replication
across labs is presented as stronger evidence than any single p-value.

### Published dataset provenance

Cevallos CA, White AL, Fazio BA, Wendt LS, Feng JW, Posfai D, Horton AL, Warrick JM,
Quintero-Carmona OA. *Transcriptomic Analysis of CAD Cell Differentiation.*
microPublication Biology, 2025. Data: [GEO GSE291553](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE291553)
(6 samples: 3 undifferentiated, 3 differentiated; 5 days serum-free DMEM/F12 + ITS).

The authors deposited a **DESeq2 summary table**, not per-sample counts. So the log₂ fold
changes and adjusted p-values shown are theirs, while the two condition bars are **group
means reconstructed** from `baseMean` and `log2FoldChange` (balanced 3v3:
`A = 2·baseMean/(1+2^lfc)`, `B = 2·baseMean − A`). The app flags this: the dataset is marked
`noReplicateData`, so individual-dish dots are **not** drawn (they were never published), the
caption says the bars are reconstructed, and the unit is labelled "norm. counts".

## Pathway enrichment & STRING network

The **Pathways** section asks "what *kind* of biology changed?" rather than looking at genes
one at a time. Bars are GO Biological Process, KEGG, MSigDB Hallmark and WikiPathways terms
from **Enrichr** (via `gseapy`); clicking a term reveals the genes driving it, and clicking a
gene opens it in the explorer. The published dataset additionally shows a **STRING** protein-interaction
network (87 proteins, 205 interactions, confidence ≥ 0.4) of the strongest movers, and it forms
an unmistakable DNA-replication/cell-cycle module (hubs Cdc45, Mcm4/5/10, Orc1, Cdc6, Rrm2).

Gene selection differs by dataset, and this matters:

- The backup data (n=1) has no significance test, so it uses the **top 200 genes each direction by
  fold change**. Thresholding at 2× leaves only 61 genes, too few to detect a programme.
- The published dataset uses **all 1,150 significant up / 343 down genes**. An earlier attempt using the
  top 250 by fold change found almost nothing in the up direction, because ranking by fold
  change favours low-expressed genes and misses coherent programmes built from many modest
  changes. That is also why the authors used GAGE/Pathview on the full ranked list.

Regenerate with:

```bash
conda run -n base python3 enrich_explorer.py   # needs internet (Enrichr + STRING APIs)
conda run -n base python3 build_explorer_data.py
```

## Uploading your own data

Accepts a tab- or comma-separated table: either the provider's `expression-matrix.tsv`
(`gene_name`, `gene_biotype`, `<sample>_cpm`/`_count`), or any table whose first column is
the gene name and the rest are numeric samples (counts or CPM).

The page auto-detects sample columns, guesses counts-vs-CPM, auto-groups by sample name,
and lets students override everything. **Group A is the starting point and group B is what
it is compared against**, so every fold change reads as B relative to A. The defaults are
`Undifferentiated` (A) and `Differentiated` (B), matching this lab's experiment; columns
named `und*`/`dif*` are detected, expanded to the full words, and ordered so the
undifferentiated samples land in A whichever way round they appear in the file. Both group
names are free-text, so any other experiment just gets renamed. On **Run analysis** it rescales to CPM, computes
log₂ fold changes, and, if **both** groups have ≥2 replicates, runs a **Welch t-test** on
log₂(CPM+1) with **Benjamini–Hochberg** correction; otherwise it says no statistics are
possible and shows an MA plot. Results fill the second tab, with CSV export.

**Files never leave the computer.** Parsing and statistics run entirely in the browser.

### Automatic cross-check against the published study

The cross-check panel runs on two of the three tabs: on the **backup data** tab it is always
on, and on the **upload** tab it appears as soon as a student's analysis finishes. Either way
it compares that dataset gene-by-gene against Cevallos et al. and reports:

- **correlation** of log₂ fold changes (on the genes the published study calls significant),
- **directional agreement**: what fraction move the same way,
- **top-gene overlap** versus chance, with a hypergeometric p-value,
- a **concordance scatter** (their fold change vs the published one, with the identity line;
  click any dot to open that gene),
- a **landmark-gene table**: Id1/Id2/Id3, Dkk1, Slit3, Dbh, Cdk1, Gap43, Pcp4, housekeeping
  genes, with an honest verdict per gene, and
- a plain-English summary that adapts to strong / moderate / weak agreement.

The panel names its own source, so the headings, axis label, table column and verdict say
either "your data" or "the backup data" depending on which tab is active. The published tab
never shows it, since comparing that dataset against itself is meaningless.

Two honesty features are built in. A gene where one dataset is flat and the other is large is
labelled **"too small to tell"** rather than counted as agreement. And if the uploaded file is
the bundled `*_SIMULATED.csv`, the panel says so loudly, because that file is derived from the
published numbers, so it matches by construction and the comparison is circular.

The backup data scores correlation 0.82, 85% directional agreement and 37× top-gene overlap
against the published study, which is a fair picture of what a good single-dish pilot looks
like next to a properly replicated one. Uploading the equivalent CSV reproduces that.

### The statistics are validated

`app.js` implements Welch's t-test (with its own `lgamma`/`betacf`/incomplete-beta routines)
and Benjamini–Hochberg. Both were checked against references: the t-test matches
`scipy.stats.ttest_ind(..., equal_var=False)` to ~15 significant figures across 8 cases
including degenerate zero-variance input, and BH matches R's `p.adjust(method="BH")` exactly.
They are exposed as `window.CADExplorer._welch` / `._bh` if you want to re-check.

It is still a *classroom approximation* of DESeq2, and the page says so. With 2–3 replicates
a t-test cannot reach very small p-values, so after correcting ~12,000 genes only strong
effects survive. The upload section explains this explicitly, since it is a genuine lesson
about why tools like DESeq2 share information across genes.

### The two example files

- `example_undiff_vs_diff.csv`: **real** counts from the backup data, 1 dish per condition.
  Demonstrates honestly that no statistics are possible.
- `example_practice_SIMULATED.csv`: **simulated** triplicates drawn around the *published*
  (published) group means with 18% lognormal noise. Labelled as simulated everywhere it is
  offered. It exists so students can watch the statistics work end-to-end, and it gives a
  built-in answer key: the genes it flags (Id1/Id2/Id3, Gng4, Thy1) are the ones the published study
  reports, while flat genes like Gapdh correctly come out non-significant.

## Run it locally

Double-click `index.html`, or serve the folder:

```bash
cd "/Users/johnpeters/Desktop/RNA-seq-analysis/cad-explorer" && python3 -m http.server 8000
```

then open <http://localhost:8000>. Needs internet for the Plotly library and fonts.

## Deploying to GitHub Pages (free)

All bundled data is publicly shareable (this lab's undiff/diff experiment plus already-published
GEO data), so a public repo is fine and GitHub Pages hosts it free.

This folder is already a git repository with everything committed on `main`. Two steps remain,
both of which need your GitHub login:

**1. Create an empty repo** at <https://github.com/new>, name it `cad-gene-explorer`,
visibility **Public**, and do *not* add a README, .gitignore or licence (the repo already has them).

**2. Push:**

```bash
cd "/Users/johnpeters/Desktop/RNA-seq-analysis/cad-explorer" && git push -u origin main
```

The `origin` remote is already configured. If git asks for a password, use a
[personal access token](https://github.com/settings/tokens) rather than your account password.

**3. Turn on Pages:** repo → **Settings** → **Pages** → Source *Deploy from a branch* →
branch `main`, folder `/ (root)` → **Save**.

The site goes live at **https://johnjacobpeters.github.io/cad-gene-explorer/** within a minute
or two. Every later `git push` redeploys automatically.

Cloudflare Pages and Netlify also work and are equally free; use one of those instead only if
you later need to put the site behind a login.

> Note: everything in `data.js` and the example CSVs is downloadable by anyone who opens the
> site. That is fine for this content, but if you ever add unpublished data, the site would
> need to move behind an access gate (e.g. Cloudflare Pages + Cloudflare Access, free for ≤50 users).

## Editing the wording

All the text on the site is listed in `editing/CAD_Explorer_text.xlsx`, one row per
string, grouped by where it appears. Type replacements in the yellow **NEW TEXT**
column, leave the rest blank, and send the file back:

```bash
python3 tools/extract_strings.py                       # regenerate the sheet from source
python3 tools/apply_strings.py editing/CAD_Explorer_text.xlsx   # write edits back
```

`apply_strings.py` re-extracts first, so spans are always current, then checks every
edited row's "Current text" against the source before writing anything. If the site
has moved on since the sheet was made, it names the mismatched rows and writes
nothing rather than guessing. `index.html` and `app.js` are patched by character
span, highest offset first, so one edit cannot shift another. Edits to `data.js` are
mirrored into `build_explorer_data.py`, so a later rebuild does not undo them.

Sentences assembled at runtime around live numbers are deliberately not listed, since
they cannot be edited safely in a spreadsheet. The workbook has a Requests tab for
describing those changes in plain English instead.

## Cache-busting

`index.html` loads `style.css`, `data.js` and `app.js` with a `?v=<date>` stamp. Without it a
browser can pair a cached `app.js` with a freshly fetched `index.html`, and a mismatch between
the two throws a null-element error (`$(...) is null`) that surfaces in the upload status box.
`build_explorer_data.py` refreshes the stamp on every run. If you edit `app.js` or `style.css`
without rebuilding the data, bump the number by hand or just re-run the build script.

## Regenerating the data

```bash
conda run -n base python3 "/Users/johnpeters/Desktop/RNA-seq-analysis/cad-explorer/build_explorer_data.py"
```

Reads `~/Downloads/G8M87F_results/` and the bundled `GSE291553_Diff_v_Undiff2.xlsx`, and
rewrites `data.js` plus both example CSVs. Re-run after any upstream change, then commit.

## Editing content

- **Datasets, themes, intro text, colours**: the `DS1` / `DS2` dictionaries
  in `build_explorer_data.py`. Re-run it after editing.
- **Glossary**: the `<details>` blocks in the *Learn the terms* section of `index.html`.
- **Upload logic / statistics**: `runUpload`, `welch`, `bh` in `app.js`.
- **Styling**: CSS variables at the top of `style.css`.

Adding another dataset means appending a dictionary of the same shape to the `datasets`
list, and `app.js` needs no changes. Per-dataset switches it honours: `primary.hasStats`
(volcano vs MA), `primary.cut` (fold-change threshold when there are no statistics), `unit`
(axis/label text), `noReplicateData` (hide per-dish dots), and an optional `secondary`
comparison plot.
