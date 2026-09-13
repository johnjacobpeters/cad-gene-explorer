# Rebuild word/document.xml inside a copy of the course template, so the draft
# inherits the existing styles, numbering, footer and page setup.
import re, html, os, shutil, subprocess
W = '/tmp/claude-0/-home-user-cad-gene-explorer/79d0798f-3f96-5596-aa7d-58d2c3706bd5/scratchpad/lab'
SRC, OUT = W + '/src', W + '/out'
E = lambda t: html.escape(t, quote=False)
SZ = '<w:sz w:val="22"/><w:szCs w:val="22"/>'

def runs(parts):
    out = []
    for seg in parts if isinstance(parts, list) else [(parts, False)]:
        t, b = seg if isinstance(seg, tuple) else (seg, False)
        rpr = ('<w:b/><w:bCs/>' if b else '') + SZ
        out.append(f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{E(t)}</w:t></w:r>')
    return ''.join(out)

def P(parts='', style=None, bullet=False, after=110, color=None, bold=False, size=None):
    ppr = '<w:pPr>'
    if style: ppr += f'<w:pStyle w:val="{style}"/>'
    if bullet: ppr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'
    ppr += f'<w:spacing w:after="{after}" w:line="264" w:lineRule="auto"/>'
    ppr += f'<w:rPr>{SZ}</w:rPr></w:pPr>'
    if isinstance(parts, str) and (color or bold or size):
        rpr = ('<w:b/><w:bCs/>' if bold else '') + (f'<w:color w:val="{color}"/>' if color else '') \
              + (f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>' if size else SZ)
        body = f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{E(parts)}</w:t></w:r>'
    else:
        body = runs(parts) if parts else ''
    return f'<w:p>{ppr}{body}</w:p>'

H1 = lambda t: P(t, style='Heading1', after=80)
H2 = lambda t: P(t, style='Heading2', after=70)
BL = lambda t: P(t, style='ListParagraph', bullet=True, after=50)

def callout(title, lines):
    """The template's single-cell shaded box with a blue left rule."""
    inner = P(title, after=60, bold=True, color='1F3864')
    inner += ''.join(P(l, after=55) for l in lines)
    return ('<w:tbl><w:tblPr><w:tblW w:w="10800" w:type="dxa"/><w:tblBorders>'
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="B8C6D9"/>'
            '<w:left w:val="single" w:sz="16" w:space="0" w:color="2E5C8A"/>'
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="B8C6D9"/>'
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="B8C6D9"/></w:tblBorders>'
            '<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar>'
            '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>'
            '</w:tblPr><w:tblGrid><w:gridCol w:w="10800"/></w:tblGrid>'
            '<w:tr><w:tc><w:tcPr><w:tcW w:w="10800" w:type="dxa"/>'
            '<w:shd w:val="clear" w:color="auto" w:fill="FAFBFD"/>'
            '<w:tcMar><w:top w:w="110" w:type="dxa"/><w:left w:w="170" w:type="dxa"/>'
            '<w:bottom w:w="110" w:type="dxa"/><w:right w:w="170" w:type="dxa"/></w:tcMar>'
            f'</w:tcPr>{inner}</w:tc></w:tr></w:tbl>') + P('', after=60)

def table(widths, rows):
    B = ''.join(f'<w:{e} w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
                for e in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
    grid = ''.join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    trs = ''
    for i, row in enumerate(rows):
        tcs = ''
        for w, cell in zip(widths, row):
            shd = '<w:shd w:val="clear" w:color="auto" w:fill="F1F4F9"/>' if i == 0 else ''
            tcs += (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{shd}'
                    '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
                    '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>'
                    + P(cell, after=0, bold=(i == 0)) + '</w:tc>')
        hdr = '<w:trPr><w:tblHeader/></w:trPr>' if i == 0 else ''
        trs += f'<w:tr>{hdr}{tcs}</w:tr>'
    return ('<w:tbl><w:tblPr><w:tblW w:w="10800" w:type="dxa"/>'
            f'<w:tblBorders>{B}</w:tblBorders>'
            '<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar>'
            '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>'
            f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>{trs}</w:tbl>') + P('', after=60)

def prelab(n, q, space=5):
    return (P(f'Pre-lab question {n}', after=60, bold=True, color='1F3864')
            + P(q, after=60) + ''.join(P('', after=120) for _ in range(space)))

URL = 'https://johnjacobpeters.github.io/cad-gene-explorer/'
b = []

b += [P('BIOL 351: Synaptic Biology with Lab', after=40),
      P('Lab X: Analysing Your RNA-seq Data', after=40, bold=True, size='30'),
      P('', after=80)]

b += [H1('Purpose'),
      P('You will open the class RNA-seq data in the CAD Gene Explorer, work out which genes '
        'changed when your cells differentiated, and check your result against an independent '
        'published study of the same experiment.')]

b += [callout('Big Picture', [
      'Lab 2 generated the samples. This lab is about reading what came back. Part 1 uses a '
      'published dataset so that everyone learns the tool on data that is known to be good. '
      'Part 2 uses your own class data, which will be messier.'])]

b += [H1('Learning objectives'), H2('Biological concepts'),
      BL('Predict which classes of genes should change when a dividing cell becomes a neuron, and check that prediction against real data.'),
      BL('Explain why agreement between two independent labs is stronger evidence than a small p-value from one.'),
      H2('Data skills'),
      BL('Read a volcano plot and an MA plot, and say when each is appropriate.'),
      BL('Distinguish a large fold change from a trustworthy one.'),
      BL('Load a count table into the portal, assign samples to groups, and export the result.')]

b += [H1('Pre-lab tasks'),
      BL('Read this document and answer the embedded pre-lab questions.'),
      BL('Open the portal and find the gene Id3 in the published dataset. Write down its fold change and adjusted p-value.'),
      BL('Review the RNA-seq terms handout.')]

b += [H1('Background'), H2("What 3' RNA-seq measures"),
      P("Your samples were sequenced from the 3' end of each transcript. The output is a count "
        'per gene per sample: how many reads came from that gene. A gene with more reads was '
        'more actively transcribed at the moment the cells were lysed. Counts are converted to '
        'CPM so that samples sequenced to different depths can be compared.'),
      H2('Key terms')]

b += [table([2600, 8200], [
      ['Term', 'What it means'],
      ['CPM', 'Counts per million. Each gene’s count scaled to the sample’s total, so samples of different depth are comparable. Under 1 is basically off, 10 to 100 is solidly on, over 1000 is a heavy hitter.'],
      ['Replicate', 'An independent dish treated the same way. Replicates measure how much a gene wobbles naturally. Without them you can describe a difference but not test it.'],
      ['log₂ fold change', 'The ratio between conditions, on a log₂ scale so up and down are symmetric. +1 is doubled, +2 is four-fold, −1 is halved.'],
      ['Adjusted p-value', 'A p-value corrected for testing thousands of genes at once. Significant here means adjusted p below 0.05 and at least a two-fold change.'],
      ['Volcano plot', 'Effect size across, confidence up. The trustworthy hits sit in the top corners. Needs replicates.'],
      ['MA plot', 'Used when there are no p-values. Fold change up and down, overall expression left to right. Trust the right-hand side, where genes are well measured.'],
      ['DESeq2', 'The standard tool for differential expression. The portal runs a simpler Welch t-test on uploaded data, which is fine for learning.'],
      ['Batch effect', 'A systematic difference caused by when or how samples were processed rather than by biology.'],
      ])]

b += [H2('Why you compare against a published study'),
      P('Cevallos et al. (2025) ran this same differentiation experiment with three dishes per '
        'condition and deposited the results publicly. Their data is built into the portal. '
        'Getting the same answer from different hands, different cells and a different '
        'sequencing run is the strongest evidence a finding is real.')]

b += [prelab(1, 'A gene shows a 10-fold increase but an adjusted p-value of 0.4. A second gene '
                'shows a 1.3-fold increase with an adjusted p-value of 0.001. Which result would '
                'you trust more, and what would you need in order to trust the other one?')]

b += [H1('Using the portal'),
      P([('Open ', False), (URL, True), ('. Everything runs in your browser and nothing you upload leaves your computer.', False)]),
      P('Three tabs sit at the top of the page:'),
      table([2900, 7900], [
      ['Tab', 'What it is'],
      ['① Published study', 'Cevallos et al., three dishes per condition, with real statistics. Start here.'],
      ['② Your own file', 'Where you load the class data in Part 2.'],
      ['③ Backup data', 'A single dish per condition from this lab. No statistics are possible, so it is descriptive only.'],
      ]),
      P('The sections down the page do the following:'),
      BL('Explore a gene. Search any gene by name to see its expression in each condition.'),
      BL('Big picture. Every gene at once, as a volcano plot when there are statistics and an MA plot when there are not.'),
      BL('Themes. Curated gene groups, such as the ID inhibitors and cell division genes.'),
      BL('Pathways. Which biological programmes are over-represented among the genes that changed.'),
      BL('Your own data. Upload, group your samples, run the analysis.'),
      BL('vs Published. Appears once you have your own result, and compares it gene by gene against the published study.')]

b += [H1('Part 1: the published dataset'),
      P('Work through these on the ① Published study tab.'),
      BL('Search Id3. Record its log₂ fold change and adjusted p-value. Id3 blocks differentiation, so predict the direction before you look.'),
      BL('Open the Big picture plot. Find Id3 on it. Note where the most convincing genes sit.'),
      BL('Open the Themes section and work through ID inhibitors, Cell division and Housekeeping genes. Record one gene from each and what it does.'),
      BL('Open Pathways. Name one programme that goes up and one that goes down, and say whether that fits a cell becoming a neuron.'),
      prelab(2, 'The housekeeping genes barely move, even though the p-values in this dataset are '
                'very small. Explain why that is reassuring rather than disappointing.')]

b += [H1('Part 2: your own data'),
      P('Your class samples will be returned as a table with one row per gene and one column per '
        'sample. Work on the ② Your own file tab.'),
      BL('Under 1 · Choose a file, select the count table. The portal reports how many samples and genes it found.'),
      BL('Under 2 · Assign each sample to a group, check the automatic assignment. Group A is the starting point, undifferentiated. Group B is what you compare against it, differentiated. Rename the groups if the labels are wrong.'),
      BL('Leave protein-coding genes only ticked unless told otherwise.'),
      BL('Click Run analysis. Results replace the second tab and the page scrolls back to the explorer.'),
      BL('Look up the same genes you recorded in Part 1. Do they move the same way?'),
      BL('Open vs Published and record the correlation, the directional agreement and the top-gene overlap.'),
      BL('Click Export results (CSV) and keep the file. You will need it for the post-lab.')]

b += [callout('If part of your sequencing failed', [
      'If only one condition came back, tick the box marked one condition only: compare against '
      'the published study, and set the dropdown to say which condition you have. The portal '
      'fills the missing half from Cevallos et al. so that you can still work.',
      'Read those fold changes carefully. Half the comparison is from another lab, so part of '
      'any difference is technical rather than biological. Large consistent changes are still '
      'informative. Small ones are not.'])]

b += [prelab(3, 'Your top ten changed genes overlap the published top ten by six genes. A '
                'classmate says this proves your experiment worked. Give one reason that is '
                'good evidence and one reason it is weaker than it sounds.')]

b += [H1('Troubleshooting'),
      table([4200, 6600], [
      ['Problem', 'What to do'],
      ['The portal says it cannot find a numeric sample column', 'The first row must be a header and the first column must be gene names. Check the file opened as a table rather than one long column.'],
      ['Very few genes matched the published dataset', 'Your file probably uses gene IDs such as ENSMUSG rather than symbols such as Id3.'],
      ['Almost nothing is significant', 'Expected with few replicates. A t-test on three dishes cannot reach small p-values after correcting for 12,000 genes. Report the strongest changes and say so.'],
      ['The groups were assigned the wrong way round', 'Rename them in the two boxes, or change the dropdowns in the sample table, then run again.'],
      ['Housekeeping genes moved a lot', 'Either the cells were in trouble or something technical differs between the groups. Note it rather than ignoring it.'],
      ])]

b += [H1('What to hand in'),
      BL('Your exported CSV.'),
      BL('A figure showing the Big picture plot for your data, with two genes labelled and a legend in your own words.'),
      BL('A short paragraph on how your result compares with Cevallos et al., quoting the correlation and directional agreement.'),
      BL('Answers to the pre-lab questions.')]

b += [H1('References'),
      BL('Qi, Y. et al. 1997. Characterization of a CNS cell line, CAD, in which morphological differentiation is initiated by serum deprivation. J. Neurosci. 17:1217–1225.'),
      BL('Cevallos, R.R. et al. 2025. Transcriptomic Analysis of CAD Cell Differentiation. microPublication Biology. GEO accession GSE291553.')]

# ---- assemble ----
src = open(SRC + '/word/document.xml', encoding='utf-8').read()
sect = re.search(r'<w:sectPr.*?</w:sectPr>', src, re.S).group(0)
head = src[:src.index('<w:body>') + len('<w:body>')]
open(SRC + '/word/document.xml', 'w', encoding='utf-8').write(head + ''.join(b) + sect + '</w:body></w:document>')

if os.path.exists(OUT): shutil.rmtree(OUT)
shutil.copytree(SRC, OUT)
dest = W + '/Lab_RNAseq_Analysis_DRAFT.docx'
if os.path.exists(dest): os.remove(dest)
subprocess.run(['zip', '-qXr', dest, '.'], cwd=OUT, check=True)
print('wrote', dest, os.path.getsize(dest), 'bytes')
