"""Optional regeneration of the historical overview; new run charts use Node only."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import FixedLocator, FuncFormatter
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs'
rows=json.loads((OUT/'reference-data.json').read_text())['rows']
plt.rcParams['svg.hashsalt']='browser-tts-reference-v1'
paper='#fffdf6';ink='#243e37';muted='#64706a';teal='#187c70';ochre='#cf8128';blue='#5b78a0'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'text.color':ink,'axes.labelcolor':muted,'xtick.color':muted,'ytick.color':ink})
fig, axes = plt.subplots(2,2,figsize=(16,12),facecolor=paper)
fig.subplots_adjust(left=.12,right=.97,top=.82,bottom=.19,wspace=.37,hspace=.50)
labels=[r['model'] for r in rows]
for ax in axes.flat:
    ax.set_facecolor(paper);ax.set_yticks(range(6),labels);ax.set_ylim(5.65,-.65)
    ax.tick_params(axis='y',length=0);ax.grid(axis='x',color='#e2e3d9');ax.set_axisbelow(True)
    for side in ['left','right','top']:ax.spines[side].set_visible(False)
    ax.spines['bottom'].set_color('#cbd0c4')
ax=axes[0,0]
ax.set_title('01  Warm article generation',loc='left',fontsize=16,pad=31,fontweight='bold')
ax.text(0,1.04,'Different timer boundaries · no speedup ratios',transform=ax.transAxes,color=muted,fontsize=9)
ax.set_xscale('log');ax.set_xlim(10,6500)
ax.xaxis.set_major_locator(FixedLocator([10,30,100,300,1000,3000]))
ax.xaxis.set_major_formatter(FuncFormatter(lambda x,p:f'{x:g}'))
ax.set_xlabel('Seconds · logarithmic axis · lower is faster')
for i,r in enumerate(rows):
    if r['cpuWarmSeconds'] is not None:
        v=r['cpuWarmSeconds'];ax.plot(v,i-.17,'o',color=teal,ms=6)
        ax.annotate(f'{v:.2f}',(v,i-.17),xytext=(7,-3),textcoords='offset points',fontsize=9)
    else:ax.text(11,i-.17,'CPU not measured',fontsize=8,color=muted,va='center')
    v=r['gpuWarmSeconds'];ax.plot(v,i+.17,'D',color=ochre,ms=5)
    ax.annotate(f'{v:.2f}',(v,i+.17),xytext=(7,-3),textcoords='offset points',fontsize=9)
fig.legend(handles=[Line2D([],[],marker='o',color=teal,ls='',label='CPU / WASM · earlier campaign'),Line2D([],[],marker='D',color=ochre,ls='',label='WebGPU · new timing-only campaign')],loc='upper left',bbox_to_anchor=(.12,.908),ncol=2,frameon=False,fontsize=11)

def bars(ax,field,title,subtitle,xlabel,color,fmt,limit):
    ax.set_title(title,loc='left',fontsize=16,pad=31,fontweight='bold')
    ax.text(0,1.04,subtitle,transform=ax.transAxes,color=muted,fontsize=9)
    for i,r in enumerate(rows):
        v=r[field];ax.barh(i,v,height=.45,color=color,alpha=.9)
        ax.text(v+limit*.018,i,fmt(r),va='center',fontsize=9)
    ax.set_xlim(0,limit);ax.set_xlabel(xlabel)
bars(axes[0,1],'originalWarmFirstNonzeroSeconds','02  Warm first sound','Original campaign only · first nonzero output','Seconds after Play · lower is faster',blue,lambda r:f"{r['originalWarmFirstNonzeroSeconds']:.3f} s",1.85)
bars(axes[1,0],'originalWarmPeakBrowserRssMB','03  Peak browser memory','Original warm runs · median of sampled peaks','Total process-tree RSS · decimal MB',teal,lambda r:f"{r['originalWarmPeakBrowserRssMB']:,.0f} MB",2050)
bars(axes[1,1],'originalDownloadMB','04  First-visit download','Original bundles · ideal 1 Mbps transfer shown as m:ss','Unique HTTP body download · decimal MB',ochre,lambda r:f"{r['originalDownloadMB']:.1f} MB / {int(round(r['originalIdealTransferSecondsAt1Mbps']))//60}:{int(round(r['originalIdealTransferSecondsAt1Mbps']))%60:02d}",100)
fig.text(.045,.955,'CPU, GPU, and the cost of getting started.',fontsize=27,fontfamily='DejaVu Serif')
fig.text(.045,.918,'SIX BROWSER TTS MODELS  /  20,000 ENGLISH CHARACTERS  /  MEASURED ON APPLE M1 PRO',fontsize=11,color=muted)
fig.text(.045,.135,'READING THE RESULTS',fontsize=10,fontweight='bold')
fig.text(.045,.111,'CPU generation includes local audio storage; GPU generation excludes it. Side-by-side values do not establish precise acceleration.',fontsize=10,color=muted)
fig.text(.045,.090,'Resource panels use the original backend: CPU/WASM for five models, WebGPU for Woof. New GPU memory and download costs were not measured.',fontsize=10,color=muted)
fig.text(.045,.069,'Memory includes the Chrome baseline, is sampled every 500 ms, and is not VRAM. Download estimates exclude network overhead and model initialization.',fontsize=10,color=muted)
fig.text(.045,.048,'WebGL: no successful model path. GPU inference may include CPU operators. PiVo reflects its current custom browser adapter.',fontsize=10,color=muted)
fig.savefig(OUT/'reference-overview.svg',facecolor=paper,metadata={'Date':None})
plt.close(fig)
