"""Build data.js for the CAD Gene Explorer (student site).

Dataset ① (default) : G8M87F  — this lab's undifferentiated vs differentiated CAD cells (n=1 each).
Dataset ②           : GSE291553 — Cevallos et al. 2025, published, n=3 each, DESeq2 results.

Also writes the two example files offered in the upload section.
Both datasets are publicly shareable.
"""
import pandas as pd, numpy as np, json, os

G8  = '/Users/johnpeters/Downloads/G8M87F_results/'
OUT = os.path.dirname(os.path.abspath(__file__)) + '/'
CEV = OUT + 'GSE291553_Diff_v_Undiff2.xlsx'     # downloaded from GEO, kept alongside for reproducibility

def dedupe(df, cols):
    df = df.dropna(subset=['gene_name']).copy()
    df['_tot'] = df[cols].sum(axis=1)
    return df.sort_values('_tot', ascending=False).drop_duplicates('gene_name')

def keep_sets(raw, genes, label):
    out = []
    for title, desc, gl in raw:
        present = [g for g in gl if g in genes]
        missing = [g for g in gl if g not in genes]
        if present: out.append({'title': title, 'desc': desc, 'genes': present})
        if missing: print(f'  [{label}/{title[:32]}] absent: {missing}')
    return out

# ══════════════════════════════════════════════════════════════════════════════
# DATASET ① — this lab: undifferentiated vs differentiated (G8M87F), n=1 each
# ══════════════════════════════════════════════════════════════════════════════
d1 = pd.read_csv(f'{G8}G8M87F-expression-matrix.tsv', sep='\t')
U, D = 'G8M87F_1_cpm', 'G8M87F_2_cpm'
UC, DC = 'G8M87F_1_count', 'G8M87F_2_count'
pc1 = dedupe(d1[(d1.gene_biotype == 'protein_coding') & ((d1[U] > 1) | (d1[D] > 1))], [U, D])
pc1['lfc'] = np.log2((pc1[D] + 1) / (pc1[U] + 1))
CUT1 = 1.0
genes1 = {r.gene_name: {'cpm': {'undiff': [round(float(getattr(r, U)), 2)],
                                'dif':    [round(float(getattr(r, D)), 2)]}}
          for r in pc1.itertuples(index=False)}
we1 = pc1[(pc1[U] >= 20) | (pc1[D] >= 20)]
top1_up, top1_dn = list(we1.nlargest(25,'lfc')['gene_name']), list(we1.nsmallest(25,'lfc')['gene_name'])
n1_up, n1_dn = int((pc1.lfc > CUT1).sum()), int((pc1.lfc < -CUT1).sum())

SETS1 = [
 ('ID inhibitors & TGF-β — the master switch',
  'ID proteins actively BLOCK differentiation. Watch them collapse: losing Id1/Id2/Id3 is the molecular event that lets the cell mature. The published study (dataset ②) sees exactly the same thing.',
  ['Id1','Id2','Id3','Id4','Tgfb1','Smad6','Smad7','Fst','Fstl3','Ngfr','Dkk1']),
 ('Neuron identity markers — already on',
  'The surprise: these barely change. CAD cells are ALREADY neuron-like before differentiation, so the switch is not "become a neuron from scratch" — it is "stop dividing and mature". Pcp4 and Gng4 are the ones that do rise.',
  ['Tubb3','Map2','Syp','Snap25','Gap43','Stmn2','Eno2','Th','Dbh','Pcp4','Gng4','Nsg2']),
 ('Cell division — easing off',
  'Differentiated neurons stop dividing, and these genes do fall — but gently. Compare the magnitudes with dataset ②, which had replicates and could prove it.',
  ['Cdk1','Ccnb1','Mki67','Top2a','Pcna','Rrm2','Aurka','Ccnd1','Ccne2']),
 ('Stress & cholesterol — switched on',
  'Differentiation is metabolically demanding. Cholesterol-synthesis genes (neurons need lots of membrane) and stress-response genes rise.',
  ['G0s2','Ddit3','Trib3','Atf3','Acss2','Pmvk','Mvd','Cd74','Ptgds','Igfbp6','Nupr1','Niban1']),
 ('Housekeeping genes — a built-in health check',
  'Genes every cell needs constantly. Here they are beautifully flat (all within ~1.3x) — exactly what healthy, deliberate differentiation looks like, and a sign the two samples are technically comparable.',
  ['Actb','Gapdh','Rplp0','Ppia','B2m','Tbp']),
]
sets1 = keep_sets(SETS1, genes1, 'lab')

QUIZ1 = [
 {'q':'Search <b>Id2</b> and <b>Id3</b>. Which way do they go, and by how much?',
  'a':'Both crash by about 11x: Id2 goes 120 → 10 CPM, Id3 92 → 7 CPM. ID proteins are <i>inhibitors of differentiation</i> — they block the transcription factors that drive maturation. Removing the brake is what lets the cell differentiate, so this is arguably the most important change in the dataset. Now switch to dataset ② and look them up again.'},
 {'q':'Open the theme <b>"Neuron identity markers"</b>. Most barely change. Why is that not a failed experiment?',
  'a':'CAD cells are already neuron-like before differentiation — Tubb3, Snap25 and Gap43 are strongly expressed in <i>both</i> conditions. Differentiation here is not "become a neuron from scratch"; it is "stop dividing and mature". A marker already near its ceiling cannot go up much.'},
 {'q':'This dataset has <b>one dish per condition</b>. What can you conclude, and what can you not?',
  'a':'You can describe differences and generate hypotheses. You cannot compute a p-value: with a single dish there is no way to measure natural dish-to-dish wobble, so you cannot separate a real change from a fluke. That is why this dataset shows an MA plot rather than a volcano plot.'},
 {'q':'So how <i>can</i> you gain confidence in a result from n=1? (Hint: look at the dataset chips.)',
  'a':'Replication by someone else. Dataset ② is an independent published study (Cevallos et al. 2025) that ran the same experiment with 3 dishes per condition. When two different labs, different cells and different sequencing runs agree, that is stronger evidence than any single p-value.'},
 {'q':'Open the <b>housekeeping</b> theme. They are all flat. Why is that reassuring?',
  'a':'Housekeeping genes are needed constantly, so they should not move. Their flatness (within ~1.3x) says the two samples are technically comparable and the cells are healthy, so the changes elsewhere are biology rather than a technical artefact.'},
 {'q':'On the MA plot, why should you trust a 3x change on the right side more than a 3x change on the left?',
  'a':'Left = weakly expressed genes measured from a handful of reads, where ratios are dominated by counting noise. Right = strongly expressed genes measured from many reads, so the ratio is precise. Always sanity-check a striking fold change against the actual CPM values.'},
 {'q':'Find <b>Dbh</b> (dopamine β-hydroxylase, which makes noradrenaline). What happens, and why is it a nice puzzle?',
  'a':'It falls sharply (about 15 → 0.1 CPM). CAD cells are catecholaminergic, so you might expect a neurotransmitter enzyme to rise. It does the opposite — and dataset ② sees the same drop (−5.3 log₂FC), so it is real, not noise. A good reminder that "differentiation" is a specific program, not a switch-everything-up.'},
]

DS1 = {
 'id':'lab', 'chipLabel':'① This lab (1 dish each)',
 'title':'What happens when a cell becomes a neuron?',
 'tagline':'Mouse CAD cells · undifferentiated vs differentiated · 1 dish each · descriptive comparison (no statistics)',
 'intro': ('<p><strong style="color:var(--text)">CAD cells</strong> are a mouse line derived from catecholaminergic neurons. '
   'In serum they divide in an immature state. Remove the serum and they <span class="term" title="Stop dividing and mature into a specialised cell type.">differentiate</span>: '
   'they stop dividing and grow long neuron-like processes.</p>'
   '<p>Here one dish of each was sequenced. Your job: work out which genes drive that switch. '
   'Start with <strong style="color:var(--gold)">Id2</strong> or <strong style="color:var(--gold)">Id3</strong> — they tell the clearest story.</p>'
   '<p class="hint">⚠ One dish per condition means <strong>no p-values are possible</strong>. Everything here is descriptive. '
   'When you find something interesting, check it against dataset ② — a published study of the same experiment <em>with</em> replicates.</p>'),
 'conditions': [
   {'id':'undiff','label':'Undifferentiated','short':'Undiff','color':'#a78bfa','n':1,'desc':'CAD cells growing in serum — dividing, immature.'},
   {'id':'dif','label':'Differentiated','short':'Diff','color':'#00b894','n':1,'desc':'Serum removed for 5 days — cells stop dividing and mature.'}],
 'primary': {'num':'dif','den':'undiff','numShort':'Differentiated','denShort':'Undifferentiated',
             'label':'differentiated vs undifferentiated','hasStats':False,'cut':CUT1},
 'secondary': None, 'unit':'CPM',
 'genes':genes1, 'sets':sets1, 'top':{'up':top1_up,'down':top1_dn},
 'summary':{'nGenes':len(genes1),'nUp':n1_up,'nDn':n1_dn,
            'upLabel':'genes >2x higher when differentiated','dnLabel':'genes >2x lower when differentiated'},
 'quick':[g for g in ['Id2','Id3','Id1','Pcp4','Cdk1','Ngfr','Dbh','Gapdh'] if g in genes1],
 'quiz':QUIZ1,
}

# ══════════════════════════════════════════════════════════════════════════════
# DATASET ② — Cevallos et al. 2025 (GEO GSE291553), n=3 vs 3, published DESeq2
# ══════════════════════════════════════════════════════════════════════════════
cv = pd.read_excel(CEV, sheet_name='Diff_v_Undiff').rename(columns={'Unnamed: 0':'gene_id','symbol':'gene_name'})
cv = cv.dropna(subset=['gene_name','padj','log2FoldChange','baseMean'])
cv = cv[cv.gene_name.astype(str) != 'NA']
cv = cv.sort_values('baseMean', ascending=False).drop_duplicates('gene_name')
# Reconstruct the two group means from baseMean and log2FC (design is balanced 3 v 3):
#   baseMean = (A + B) / 2  and  B = A * 2**lfc   =>   A = 2*baseMean / (1 + 2**lfc)
ratio = np.power(2.0, cv.log2FoldChange.clip(-20, 20))
cv['A'] = 2 * cv.baseMean / (1 + ratio)      # undifferentiated
cv['B'] = 2 * cv.baseMean - cv['A']          # differentiated
genes2 = {}
for r in cv.itertuples(index=False):
    genes2[str(r.gene_name)] = {
        'cpm': {'undiff':[round(float(r.A),2)], 'dif':[round(float(r.B),2)]},
        'de': {'lfc':round(float(r.log2FoldChange),3),
               'padj':float(f'{float(r.padj):.3g}'), 'bm':round(float(r.baseMean),1)}}
sig2 = cv[(cv.padj < 0.05) & (cv.log2FoldChange.abs() > 1)]
we2 = sig2[sig2.baseMean >= 50]
top2_up, top2_dn = list(we2.nlargest(30,'log2FoldChange')['gene_name']), list(we2.nsmallest(30,'log2FoldChange')['gene_name'])
n2_up, n2_dn = int((sig2.log2FoldChange > 0).sum()), int((sig2.log2FoldChange < 0).sum())

SETS2 = [
 ('ID inhibitors — the same master switch, now with statistics',
  'The identical result as dataset ①, but with 3 dishes per condition and real p-values. Id3 falls ~290x (p ≈ 4e-32). This is what replication looks like.',
  ['Id1','Id2','Id3','Id4','Ngfr','Dkk1','Tgfb1','Smad6','Smad7']),
 ('Neuronal genes switched ON',
  'With more statistical power, the published study detects the neuronal program the single-dish experiment could only hint at: ion channels, synapse proteins and axon-growth genes all rise.',
  ['Snap25','Gap43','Nrxn1','Nlgn2','Scn3a','Cacna1b','Thy1','Gng4','Pcp4','Lamp5','Tubb3','Syt1','Stmn2']),
 ('Cell division — shutting down',
  'Differentiating neurons exit the cell cycle. Every one of these falls significantly.',
  ['Cdk1','Ccnb1','Mki67','Top2a','Pcna','Rrm2','Cdc45','Aurka','Ccne2','Mcm2']),
 ('Biggest increases',
  'The strongest inductions in the published data — extracellular-matrix and membrane genes as the cells build neurites.',
  ['Fmod','Thy1','Fa2h','Cilp','Foxs1','Panx3','Lamp5','G0s2']),
 ('Biggest decreases',
  'The strongest losses. Note Id3 and Id2 near the top, plus Dbh and Sctr — the same genes dataset ① flagged.',
  ['Galnt5','Id3','Id2','Dbh','Tbx3','Sctr','Cux2','Adamtsl2','Myrip','Ptprq']),
 ('Housekeeping genes — a built-in health check',
  'Genes every cell needs constantly. They shift only slightly (well under 2x) even though the p-values are tiny — a reminder that with enough replicates, statistically significant does not mean biologically large.',
  ['Actb','Gapdh','Rplp0','Ppia','B2m','Tbp']),
]
sets2 = keep_sets(SETS2, genes2, 'cevallos')

QUIZ2 = [
 {'q':'Look up <b>Id3</b> here, then switch to dataset ① and look it up again. What do you find?',
  'a':'Both show a large drop: about 11x in the single-dish experiment and about 290x here (log₂FC −8.2, p ≈ 4e-32). Two independent labs, different cells, different sequencing — same answer. That agreement is the strongest evidence either result is real.'},
 {'q':'This dataset has p-values but dataset ① does not. What single feature of the design makes the difference?',
  'a':'Replicates. This study sequenced 3 dishes per condition, so DESeq2 could measure how much each gene naturally wobbles between dishes and ask whether the difference exceeds that wobble. With one dish there is nothing to compare the difference against.'},
 {'q':'Open the <b>housekeeping</b> theme. Several have tiny p-values (like 1e-5) yet change by well under 2x. What is the lesson?',
  'a':'Statistical significance and biological importance are different things. With enough replicates, even a 1.3x change can be measured confidently enough to be "significant". Always read the fold change alongside the p-value — which is why the significance cutoff here also requires at least a 2x change.'},
 {'q':'Compare <b>Cdk1</b> in both datasets. The published one shows a smaller fold change but is far more convincing. Why?',
  'a':'Dataset ① shows about −1.4x, this one about −1.9x with p ≈ 4e-9. The single-dish number could easily be noise; here three dishes per condition agree, so we can be confident the cell cycle really is winding down. Effect size without replication is just a number.'},
 {'q':'The bars for this dataset are labelled "reconstructed group averages". What does that mean, and what can you not do with them?',
  'a':'The authors deposited a summary table (average expression, fold change, p-value) rather than each dish\'s values. The two bars are worked back out from that summary, so they show the right relative difference but are estimates — and there are no individual dish dots, because those numbers were never published. The fold changes and p-values, though, are the authors\' own.'},
 {'q':'On the volcano plot, find a gene with a huge fold change but a weak p-value. Why does that happen?',
  'a':'Usually because the gene is expressed at very low levels, so the three dishes disagreed a lot. A big average change built on noisy, sparse counts is not convincing — which is exactly what the p-value is telling you.'},
 {'q':'This data came from GEO accession <b>GSE291553</b>. Why does it matter that journals require this?',
  'a':'Because it lets anyone re-analyse, check or reuse published results — which is exactly what happened here. You could download another GEO dataset yourself and load it into the upload tool on this page.'},
]

DS2 = {
 'id':'cevallos', 'chipLabel':'② Published study (n=3 each)',
 'title':'The same experiment, published — Cevallos et al. 2025',
 'tagline':'Mouse CAD cells · undifferentiated vs differentiated · 3 dishes each · DESeq2 results from GEO GSE291553',
 'intro': ('<p>An independent group ran the same experiment properly replicated: <strong style="color:var(--text)">3 dishes per condition</strong>, '
   'differentiated for 5 days in serum-free media — and deposited the results publicly.</p>'
   '<p>Because there are replicates, this dataset has <strong style="color:var(--gold)">real p-values</strong>. '
   'Use it to check anything you found in dataset ①. Start with <strong style="color:var(--gold)">Id3</strong>.</p>'
   '<p class="hint">Source: Cevallos CA, White AL, Fazio BA, Wendt LS, Feng JW, Posfai D, Horton AL, Warrick JM, Quintero-Carmona OA. '
   '<em>Transcriptomic Analysis of CAD Cell Differentiation.</em> microPublication Biology, 2025. Data: '
   '<a href="https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE291553" target="_blank" rel="noopener" style="color:var(--gold)">GEO GSE291553</a>. '
   'The authors published a summary table, so the two bars are <strong>group averages reconstructed</strong> from it — the fold changes and p-values are theirs.</p>'),
 'conditions': [
   {'id':'undiff','label':'Undifferentiated','short':'Undiff','color':'#a78bfa','n':3,'desc':'CAD cells in serum — dividing. 3 dishes.'},
   {'id':'dif','label':'Differentiated','short':'Diff','color':'#00b894','n':3,'desc':'5 days serum-free (DMEM/F12 + ITS) — neurite-like processes. 3 dishes.'}],
 'primary': {'num':'dif','den':'undiff','numShort':'Differentiated','denShort':'Undifferentiated',
             'label':'differentiated vs undifferentiated','hasStats':True,'statsName':'DESeq2 (published)',
             'statsNote':'(published result, Cevallos et al. 2025)'},
 'secondary': None, 'unit':'norm. counts', 'noReplicateData': True,
 'genes':genes2, 'sets':sets2, 'top':{'up':top2_up,'down':top2_dn},
 'summary':{'nGenes':len(genes2),'nUp':n2_up,'nDn':n2_dn,
            'upLabel':'genes significantly UP when differentiated','dnLabel':'genes significantly DOWN when differentiated'},
 'quick':[g for g in ['Id3','Id2','Gap43','Gng4','Cdk1','Thy1','Dbh','Gapdh'] if g in genes2],
 'quiz':QUIZ2,
}

# ══════════════════════════════════════════════════════════════════════════════
# Example files for the upload section (both derived from public G8M87F counts)
# ══════════════════════════════════════════════════════════════════════════════
ex = dedupe(d1[d1.gene_biotype == 'protein_coding'], [UC, DC])[['gene_name', UC, DC]]
ex = ex[(ex[[UC, DC]] > 0).any(axis=1)].rename(columns={'gene_name':'gene', UC:'undifferentiated', DC:'differentiated'})
ex['undifferentiated'] = ex['undifferentiated'].round().astype(int)
ex['differentiated']   = ex['differentiated'].round().astype(int)
ex.to_csv(f'{OUT}example_undiff_vs_diff.csv', index=False)

# Practice file: simulated triplicates drawn around the PUBLISHED (Cevallos) group means,
# so the effect sizes are realistic and the statistics have something to find. Students can
# check their answer against dataset (2). Clearly labelled as simulated wherever it is offered.
rng = np.random.default_rng(7)
basis = cv[cv.baseMean >= 10][['gene_name','A','B']].copy()
sim = pd.DataFrame({'gene': basis['gene_name'].values})
for col, grp in [('A','undiff'), ('B','diff')]:
    for k in (1, 2, 3):
        noise = np.exp(rng.normal(0, 0.18, len(basis)))
        sim[f'{grp}_rep{k}'] = np.maximum(0, np.round(basis[col].values * noise)).astype(int)
sim.to_csv(f'{OUT}example_practice_SIMULATED.csv', index=False)

# ══════════════════════════════════════════════════════════════════════════════
# ── Attach GO/KEGG enrichment + STRING network (built by enrich_explorer.py) ──
ENR = OUT + 'enrichment.json'
if os.path.exists(ENR):
    e = json.load(open(ENR))
    DS1['enrich'] = {'up': e['lab']['up'], 'dn': e['lab']['dn'],
                     'nUp': e['lab']['n_up'], 'nDn': e['lab']['n_dn'],
                     'how': ('Top %d genes in each direction by fold change (there is no significance test with one dish), '
                             'tested against all %s expressed genes with Enrichr.' % (e['lab']['n_up'], f"{e['lab']['bg']:,}"))}
    DS2['enrich'] = {'up': e['cevallos']['up'], 'dn': e['cevallos']['dn'],
                     'nUp': e['cevallos']['n_up'], 'nDn': e['cevallos']['n_dn'],
                     'string': e['string'],
                     'how': ('All %s significantly up and %s significantly down genes (padj<0.05, |log2FC|>1), '
                             'tested against all %s measured genes with Enrichr.' % (f"{e['cevallos']['n_up']:,}", f"{e['cevallos']['n_dn']:,}", f"{e['cevallos']['bg']:,}"))}
    print(f"  enrichment : lab {len(DS1['enrich']['up'])}up/{len(DS1['enrich']['dn'])}dn | "
          f"cevallos {len(DS2['enrich']['up'])}up/{len(DS2['enrich']['dn'])}dn | "
          f"STRING {len(e['string']['nodes'])} nodes")
else:
    print('  WARNING: enrichment.json missing — run enrich_explorer.py first')

payload = {'datasets': [DS1, DS2]}
with open(f'{OUT}data.js','w') as f:
    f.write('window.CAD=' + json.dumps(payload, separators=(',',':')) + ';\n')
print(f'\nWrote data.js ({os.path.getsize(OUT+"data.js")/1e6:.2f} MB)')
print(f'  ① lab      : {len(genes1):>6,} genes | up {n1_up} / down {n1_dn} (>2x, no stats) | {len(sets1)} themes | {len(QUIZ1)} questions')
print(f'  ② cevallos : {len(genes2):>6,} genes | up {n2_up} / down {n2_dn} (DESeq2)        | {len(sets2)} themes | {len(QUIZ2)} questions')
print(f'  examples   : example_undiff_vs_diff.csv ({len(ex):,} genes), example_practice_SIMULATED.csv ({len(sim):,} genes, 3v3 simulated)')
