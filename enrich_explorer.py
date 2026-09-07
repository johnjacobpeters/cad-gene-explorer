"""GO/KEGG enrichment for both explorer datasets, via Enrichr (gseapy) + STRING."""
import pandas as pd, numpy as np, json, time, requests, warnings
warnings.filterwarnings('ignore')
import gseapy as gp

G8  = '/Users/johnpeters/Downloads/G8M87F_results/'
OUT = '/Users/johnpeters/Desktop/RNA-seq-analysis/cad-explorer/'
CEV = OUT + 'GSE291553_Diff_v_Undiff2.xlsx'
GENE_SETS = [('GO Biological Process','GO_Biological_Process_2023'),
             ('KEGG','KEGG_2019_Mouse'),
             ('MSigDB Hallmark','MSigDB_Hallmark_2020'),
             ('WikiPathways','WikiPathways_2024_Mouse')]

def enrich(genes, bg_n, label):
    res=[]
    for short,db in GENE_SETS:
        for attempt in range(3):
            try:
                e=gp.enrichr(gene_list=genes, gene_sets=db, background=bg_n, outdir=None, verbose=False)
                r=e.results; r=r[r['Adjusted P-value']<0.05].copy(); r['db']=short
                res.append(r); time.sleep(1.0); break
            except Exception as ex:
                if attempt==2: print(f'    [{short}] {label}: {ex}')
                time.sleep(8)
    if not res: return []
    c=pd.concat(res); out=[]
    for _,r in c.sort_values('Adjusted P-value').head(18).iterrows():
        out.append({'db':r['db'],'term':str(r['Term']),'overlap':str(r['Overlap']),
                    'p':float(r['Adjusted P-value']),
                    'nlp':round(float(-np.log10(max(r['Adjusted P-value'],1e-300))),2),
                    'genes':';'.join(str(r['Genes']).split(';')[:14])})
    return out

result={}

# ── Dataset 1: G8M87F (n=1, exploratory) ─────────────────────────────────────
d1=pd.read_csv(f'{G8}G8M87F-expression-matrix.tsv',sep='\t')
U,D='G8M87F_1_cpm','G8M87F_2_cpm'
pc=d1[(d1.gene_biotype=='protein_coding')&((d1[U]>1)|(d1[D]>1))].dropna(subset=['gene_name']).copy()
pc['lfc']=np.log2((pc[D]+1)/(pc[U]+1))
bg1=int(len(pc))
# n=1: no significance test exists, so take the top movers by fold change.
# (Thresholding at 2x leaves only 61 genes, too few to detect a programme.)
up1=pc.nlargest(200,'lfc')['gene_name'].astype(str).str.upper().drop_duplicates().tolist()
dn1=pc.nsmallest(200,'lfc')['gene_name'].astype(str).str.upper().drop_duplicates().tolist()
print(f'[lab] bg={bg1}  up={len(up1)}  down={len(dn1)}')
result['lab']={'up':enrich(up1,bg1,'lab-up'),'dn':enrich(dn1,bg1,'lab-dn'),
               'n_up':len(up1),'n_dn':len(dn1),'bg':bg1}
print(f'  -> up terms {len(result["lab"]["up"])}, down terms {len(result["lab"]["dn"])}')

# ── Dataset 2: Cevallos (published, n=3) ─────────────────────────────────────
cv=pd.read_excel(CEV,sheet_name='Diff_v_Undiff').rename(columns={'symbol':'gene_name'})
cv=cv.dropna(subset=['gene_name','padj','log2FoldChange']); cv=cv[cv.gene_name.astype(str)!='NA']
bg2=int(len(cv))
sig=cv[(cv.padj<0.05)&(cv.log2FoldChange.abs()>1)]
# Use ALL significant genes (not a top-N by fold change): over-representation on a
# fold-change-truncated list misses coherent programmes made of many modest changes.
up2=sig[sig.log2FoldChange>0]['gene_name'].astype(str).str.upper().drop_duplicates().tolist()
dn2=sig[sig.log2FoldChange<0]['gene_name'].astype(str).str.upper().drop_duplicates().tolist()
print(f'[cevallos] bg={bg2}  up={len(up2)}  down={len(dn2)}')
result['cevallos']={'up':enrich(up2,bg2,'cev-up'),'dn':enrich(dn2,bg2,'cev-dn'),
                    'n_up':len(up2),'n_dn':len(dn2),'bg':bg2}
print(f'  -> up terms {len(result["cevallos"]["up"])}, down terms {len(result["cevallos"]["dn"])}')

# ── STRING network + enrichment on the Cevallos DE genes ─────────────────────
TAX=10090
def string_map(gs):
    r=requests.post('https://string-db.org/api/json/get_string_ids',
        data={'identifiers':'\r'.join(gs),'species':TAX,'limit':1,'echo_query':1},timeout=60)
    return list(dict.fromkeys(x['preferredName'] for x in r.json())) if r.status_code==200 else []
def string_net(p,score=400):
    r=requests.post('https://string-db.org/api/json/network',
        data={'identifiers':'\r'.join(p),'species':TAX,'required_score':score},timeout=60)
    d=r.json() if r.status_code==200 else []
    return pd.DataFrame(d) if d else pd.DataFrame()

# well-expressed strong movers make a readable network
strong=sig[sig.baseMean>=200]
sel=list(strong.nlargest(70,'log2FoldChange')['gene_name'])+list(strong.nsmallest(70,'log2FoldChange')['gene_name'])
sel=list(dict.fromkeys(str(g) for g in sel))[:140]
mapped=string_map(sel); print(f'[STRING] input {len(sel)} -> mapped {len(mapped)}')
net=string_net(mapped)
nodes,links=[],[]
if len(net) and 'preferredName_A' in net.columns:
    deg={}
    for _,r in net.iterrows():
        a,b=r['preferredName_A'],r['preferredName_B']
        deg[a]=deg.get(a,0)+1; deg[b]=deg.get(b,0)+1
        links.append({'s':a,'t':b,'w':round(float(r['score']),3)})
    lfcmap=dict(zip(cv.gene_name.astype(str),cv.log2FoldChange.round(3)))
    for g in deg: nodes.append({'id':g,'d':deg[g],'lfc':float(lfcmap.get(g,0))})
    print(f'[STRING] {len(nodes)} nodes, {len(links)} edges; top hubs:',
          [g for g in sorted(deg,key=deg.get,reverse=True)[:10]])
str_enr=[]
if mapped:
    r=requests.post('https://string-db.org/api/json/enrichment',
        data={'identifiers':'\r'.join(mapped),'species':TAX},timeout=60)
    if r.status_code==200:
        for e in sorted(r.json(),key=lambda x:x.get('fdr',1)):
            if e.get('fdr',1)<0.05 and e.get('category','') in ('Process','KEGG','Function','Component','WikiPathways','RCTM'):
                str_enr.append({'cat':e.get('category',''),'term':e.get('description',''),
                                'fdr':float(e.get('fdr',1)),'n':int(e.get('number_of_genes',0))})
            if len(str_enr)>=25: break
    print(f'[STRING] enrichment terms: {len(str_enr)}')

result['string']={'nodes':nodes,'links':links,'enrich':str_enr}
json.dump(result,open(OUT+'enrichment.json','w'),separators=(',',':'))
print('\nSaved enrichment.json')
for k in ('lab','cevallos'):
    print(f'\n=== {k.upper()}: top UP terms ===')
    for t in result[k]['up'][:8]: print(f"  [{t['db'][:14]:14s}] {t['term'][:58]:58s} p={t['p']:.1e} {t['overlap']}")
    print(f'=== {k.upper()}: top DOWN terms ===')
    for t in result[k]['dn'][:8]: print(f"  [{t['db'][:14]:14s}] {t['term'][:58]:58s} p={t['p']:.1e} {t['overlap']}")
