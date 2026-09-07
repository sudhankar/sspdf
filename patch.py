from pathlib import Path
import shutil, re, json
from PIL import Image
root=Path('/tmp/sspdf_patch')
idx=root/'index.html'; css=root/'style.css'; js=root/'script.js'; manifest=root/'manifest.json'

# Branding asset: use the user's uploaded artwork as the single replaceable branding source.
shutil.copy2('/mnt/data/1.png', root/'assets'/'branding.png')

s=idx.read_text(encoding='utf-8')
s=s.replace('<link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />','<link rel="icon" type="image/png" href="./assets/branding.png" />')
# Header logo SVG -> image
start=s.find('        <svg class="brand-logo" viewBox="0 0 512 512">')
if start!=-1:
    end=s.find('        </svg>', start)+len('        </svg>')
    s=s[:start]+'        <img class="brand-logo brand-image" src="./assets/branding.png" alt="SSPDF" />'+s[end:]
# Welcome logo SVG -> image
start=s.find('            <svg class="welcome-logo" viewBox="0 0 512 512">')
if start!=-1:
    end=s.find('            </svg>', start)+len('            </svg>')
    s=s[:start]+'            <img class="welcome-logo welcome-brand-image" src="./assets/branding.png" alt="SSPDF" />'+s[end:]
# Add FAQ button after shortcuts button
needle='''        <button class="icon-btn" id="btn-shortcuts" title="Keyboard Shortcuts">'''
pos=s.find(needle)
if pos!=-1:
    # find end of this button
    end=s.find('</button>', pos)+len('</button>')
    faq='''\n        <button class="icon-btn" id="btn-faq" title="FAQ — How to use SSPDF" aria-label="FAQ — How to use SSPDF">\n          <span class="faq-icon">?</span>\n          <span class="faq-label">FAQ</span>\n        </button>'''
    s=s[:end]+faq+s[end:]
# Insert FAQ modal before About modal
marker='  <!-- ABOUT & PRIVACY MODAL -->'
faqmodal='''  <!-- FAQ / USER GUIDE MODAL -->\n  <div class="modal-backdrop hidden" id="modal-faq">\n    <div class="modal-box lg faq-modal">\n      <div class="modal-header">\n        <h3>SSPDF FAQ — उपयोग कैसे करें?</h3>\n        <button class="modal-close" data-close="modal-faq" aria-label="Close FAQ">&times;</button>\n      </div>\n      <div class="modal-body faq-body">\n        <p class="modal-desc">नीचे SSPDF के मुख्य विकल्पों के उपयोग की आसान, बिन्दुवार गाइड है।</p>\n        <details open><summary>1. PDF खोलना और देखना</summary><ul><li><b>Open / Select PDF File</b> से PDF चुनें या Drag &amp; Drop करें।</li><li>नीचे/ऊपर के Zoom controls से zoom करें। Mobile पर दो उंगलियों से pinch-zoom भी करें।</li><li><b>Pages</b> से page बदलें; <b>Properties</b> से चुने हुए object की settings बदलें।</li></ul></details>\n        <details><summary>2. Text — लिखना, move करना और formatting</summary><ul><li><b>Text</b> tool चुनकर PDF पर tap/click करें और text लिखें।</li><li>Text box को single tap/click करके select करें और drag करके move करें।</li><li><b>Double click/tap</b> करके text editing शुरू करें।</li><li>किसी <b>एक शब्द</b> को बदलना हो तो editing mode में उस शब्द को select करें। फिर <b>Properties</b> खोलकर Bold, Italic, Color या Font Size लगाएँ।</li><li>पूरे text box का font, size या alignment बदलने के लिए पहले text box select करें, फिर <b>Properties</b> में विकल्प चुनें।</li><li>Alignment: Left / Center / Right / Justify उपलब्ध हैं।</li></ul></details>\n        <details><summary>3. Highlight / Draw / Whiteout / Shapes</summary><ul><li>Tool चुनें, फिर PDF पर drag करें।</li><li>Color, thickness और opacity <b>Properties</b> में बदलें।</li><li><b>Arrow</b> और <b>Ellipse</b> को drag करके बनाएं और Select tool से move करें।</li><li>Highlight करते समय चुना गया रंग आगे के highlights पर लागू होगा; इससे पहले के text का रंग नहीं बदलना चाहिए।</li></ul></details>\n        <details><summary>4. Image और Signature</summary><ul><li><b>Image</b> से image डालें; Select mode में move और corner handle से resize करें।</li><li><b>Signature</b> में Draw, Type या Upload विकल्प इस्तेमाल करें।</li><li>Mobile पर resize handle बड़ा touch target है; image को page के बीच में fit किया जाता है।</li></ul></details>\n        <details><summary>5. Pages — Add, Delete, Rotate, Reorder</summary><ul><li><b>Add PDF after current page</b> या <b>Add Blank Page</b> से page जोड़ें।</li><li>Rotate Left/Right से page घुमाएँ।</li><li>Delete से page हटाएँ और thumbnails को drag करके reorder करें।</li></ul></details>\n        <details><summary>6. Merge PDF</summary><ul><li><b>Merge</b> खोलें → PDFs चुनें → files का order drag करके तय करें → <b>Merge &amp; Export</b> दबाएँ।</li><li>Result PDF browser में client-side बनती है और download होती है।</li></ul></details>\n        <details><summary>7. Split PDF</summary><ul><li><b>Split</b> खोलें। All pages, selected/current या page range चुनें।</li><li>Split करने के बाद ZIP/PDF download workflow follow करें।</li></ul></details>\n        <details><summary>8. Image → PDF</summary><ul><li>एक या कई JPG/PNG/WEBP images चुनें।</li><li>Images को drag करके order बदलें।</li><li>Page size, orientation, margin और image fit चुनें → <b>Create PDF &amp; Download</b>।</li></ul></details>\n        <details><summary>9. PDF → Image</summary><ul><li>Pages में All / Current / Range चुनें।</li><li>PNG, JPG या WebP और 100–300% resolution चुनें।</li><li>Multiple pages होने पर ZIP download किया जा सकता है।</li></ul></details>\n        <details><summary>10. OCR</summary><ul><li><b>OCR</b> खोलें → English, Hindi या English + Hindi चुनें → Run OCR.</li><li>OCR text searchable/selectable बनाने का प्रयास करता है और extracted text को Copy/TXT भी किया जा सकता है।</li></ul></details>\n        <details><summary>11. Compress</summary><ul><li>Low / Medium / High compression चुनें।</li><li>Selectable/copyable text रखना हो तो <b>Keep selectable/copyable text</b> चुनें।</li></ul></details>\n        <details><summary>12. Scan और Document Enhancement</summary><ul><li><b>Scan</b> mobile browser में rear camera/file capture workflow देता है; pages जोड़कर PDF बनाएं।</li><li><b>Enhance</b> में Auto Enhance, Grayscale, Black &amp; White, High Contrast, Sharpen, Brightness और Contrast का उपयोग करें।</li><li>Enhancement current page, range या all pages पर लगाया जा सकता है।</li></ul></details>\n        <details><summary>13. Search, Undo/Redo और Export</summary><ul><li><b>Ctrl+F</b> से PDF text search करें; Next/Previous से matches पर जाएँ।</li><li><b>Undo / Redo</b> से editing actions वापस/फिर लागू करें।</li><li>अंत में <b>Export PDF</b> दबाकर edited PDF download करें।</li></ul></details>\n        <details><summary>14. Privacy</summary><ul><li>SSPDF का editor client-side architecture पर काम करता है; user PDF processing के लिए backend upload आवश्यक नहीं है।</li><li>Signatures और local recovery जैसी सुविधाएँ browser/device storage पर आधारित हैं।</li></ul></details>\n      </div>\n      <div class="modal-footer"><button class="primary-btn" data-close="modal-faq">Close</button></div>\n    </div>\n  </div>\n\n'''
s=s.replace(marker, faqmodal+marker)
idx.write_text(s,encoding='utf-8')

# Manifest use same branding image so replacing assets/branding.png updates browser/app branding.
m=json.loads(manifest.read_text(encoding='utf-8'))
m['icons']=[{'src':'./assets/branding.png','type':'image/png','sizes':'1027x653'}]
manifest.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# CSS fixes
c=css.read_text(encoding='utf-8')
css_add=r'''
/* v2.1 — branding, mobile modal safety, and text editing */
.brand-image { object-fit: cover; object-position: 43% 32%; border-radius: 8px; display:block; }
.welcome-brand-image { width: 170px; height: 108px; object-fit: cover; object-position: 43% 32%; border-radius: 14px; display:block; box-shadow: var(--shadow-md); }
.overlay-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.overlay-text[contenteditable="true"] { cursor:text; -webkit-user-select:text; user-select:text; touch-action:auto; }
.overlay-text span { -webkit-user-select:text; user-select:text; }
.modal-backdrop { overflow-y:auto; overscroll-behavior:contain; }
.modal-box { flex:0 1 auto; min-height:0; }
.modal-header, .modal-footer { flex-shrink:0; }
.modal-body { min-height:0; }
.faq-body details { border:1px solid var(--border-color); border-radius:10px; padding:0; background:var(--bg-surface); }
.faq-body summary { cursor:pointer; list-style:none; padding:12px 14px; font-weight:700; }
.faq-body summary::-webkit-details-marker { display:none; }
.faq-body summary:after { content:'+'; float:right; color:var(--text-muted); }
.faq-body details[open] summary:after { content:'−'; }
.faq-body ul { margin:0; padding:0 18px 14px 34px; }
.faq-body li { margin:7px 0; line-height:1.5; }
.faq-icon { font-weight:800; font-size:18px; line-height:1; }
.faq-label { margin-left:4px; font-size:.78rem; }
#btn-faq { display:inline-flex; align-items:center; justify-content:center; gap:2px; }
@media (max-width:768px) {
  .modal-backdrop { padding:8px; align-items:center; justify-content:center; }
  .modal-box, .modal-box.md, .modal-box.lg, .modal-box.sm { width:100%; max-width:none; max-height:calc(100dvh - 16px); border-radius:14px; }
  .modal-body { flex:1 1 auto; overflow-y:auto; max-height:none; min-height:0; -webkit-overflow-scrolling:touch; }
  .modal-footer { position:sticky; bottom:0; background:var(--bg-surface); z-index:2; padding:10px 12px; }
  .header-actions #btn-about, .header-actions #btn-shortcuts, .header-actions #btn-faq { display:inline-flex; }
  .header-actions .icon-btn { min-width:32px; }
  .brand-image { width:32px; height:32px; object-position:43% 32%; }
  .welcome-brand-image { width:150px; height:96px; }
  .faq-label { display:inline; }
}
'''
c += css_add
css.write_text(c,encoding='utf-8')

# JS patches
j=js.read_text(encoding='utf-8')
# Add FAQ listener
j=j.replace("document.getElementById('btn-shortcuts').addEventListener('click', () => openModal('modal-shortcuts'));\n    document.getElementById('btn-about').addEventListener('click', () => openModal('modal-about'));",
            "document.getElementById('btn-shortcuts').addEventListener('click', () => openModal('modal-shortcuts'));\n    const faqBtn = document.getElementById('btn-faq');\n    if (faqBtn) faqBtn.addEventListener('click', () => openModal('modal-faq'));\n    document.getElementById('btn-about').addEventListener('click', () => openModal('modal-about'));")
# Replace color/property handlers block
old="""    DOM.colorSwatches.forEach(swatch => {\n      swatch.addEventListener('click', () => {\n        DOM.colorSwatches.forEach(s => s.classList.remove('active'));\n        swatch.classList.add('active');\n        state.activeColor = swatch.dataset.color;\n        updateSelectedElementStyle();\n      });\n    });\n\n    DOM.customColorInput.addEventListener('input', (e) => {\n      state.activeColor = e.target.value;\n      updateSelectedElementStyle();\n    });\n"""
new="""    DOM.colorSwatches.forEach(swatch => {\n      swatch.addEventListener('pointerdown', rememberTextSelection, {passive:true});\n      swatch.addEventListener('click', () => {\n        DOM.colorSwatches.forEach(s => s.classList.remove('active'));\n        swatch.classList.add('active');\n        state.activeColor = swatch.dataset.color;\n        if (!applyInlineStyleToSelection({ color: state.activeColor })) updateSelectedElementStyle();\n      });\n    });\n\n    DOM.customColorInput.addEventListener('pointerdown', rememberTextSelection, {passive:true});\n    DOM.customColorInput.addEventListener('input', (e) => {\n      state.activeColor = e.target.value;\n      if (!applyInlineStyleToSelection({ color: state.activeColor })) updateSelectedElementStyle();\n    });\n"""
if old not in j: print('color block not found')
else: j=j.replace(old,new)
# Replace font size/family handlers
j=j.replace("""    DOM.fontSizeInput.addEventListener('input', (e) => {\n      state.fontSize = parseInt(e.target.value, 10);\n      DOM.fontSizeVal.textContent = `${state.fontSize}px`;\n      updateSelectedElementStyle();\n    });\n\n    DOM.fontFamilySelect.addEventListener('change', (e) => {\n      state.fontFamily = e.target.value;\n      updateSelectedElementStyle();\n    });\n""", """    DOM.fontSizeInput.addEventListener('pointerdown', rememberTextSelection, {passive:true});\n    DOM.fontSizeInput.addEventListener('input', (e) => {\n      state.fontSize = parseInt(e.target.value, 10);\n      DOM.fontSizeVal.textContent = `${state.fontSize}px`;\n      if (!applyInlineStyleToSelection({ fontSize: `${state.fontSize}px` })) updateSelectedElementStyle();\n    });\n\n    DOM.fontFamilySelect.addEventListener('pointerdown', rememberTextSelection, {passive:true});\n    DOM.fontFamilySelect.addEventListener('change', (e) => {\n      state.fontFamily = e.target.value;\n      if (!applyInlineStyleToSelection({ fontFamily: state.fontFamily })) updateSelectedElementStyle();\n    });\n""")
# alignment can apply whole text only; capture selection but don't alter inline alignment
# Bold/italic replace
j=j.replace("""    const boldBtn=document.getElementById('prop-bold');\n    if(boldBtn) boldBtn.addEventListener('click',()=>{const t=state.selectedElement?.querySelector('.overlay-text');if(!t)return;t.style.fontWeight=getComputedStyle(t).fontWeight==='700'?'400':'700';boldBtn.classList.toggle('active',t.style.fontWeight==='700');saveStateToHistory();});\n    const italicBtn=document.getElementById('prop-italic');\n    if(italicBtn) italicBtn.addEventListener('click',()=>{const t=state.selectedElement?.querySelector('.overlay-text');if(!t)return;t.style.fontStyle=getComputedStyle(t).fontStyle==='italic'?'normal':'italic';italicBtn.classList.toggle('active',t.style.fontStyle==='italic');saveStateToHistory();});\n""", """    const boldBtn=document.getElementById('prop-bold');\n    if(boldBtn) { boldBtn.addEventListener('pointerdown', rememberTextSelection, {passive:true}); boldBtn.addEventListener('click',()=>{\n      const t=state.selectedElement?.querySelector('.overlay-text'); if(!t)return;\n      if(!applyInlineStyleToSelection({fontWeight:getComputedStyle(t).fontWeight==='700'?'400':'700'})){ t.style.fontWeight=getComputedStyle(t).fontWeight==='700'?'400':'700'; }\n      boldBtn.classList.toggle('active', getComputedStyle(t).fontWeight==='700'); saveStateToHistory();\n    }); }\n    const italicBtn=document.getElementById('prop-italic');\n    if(italicBtn) { italicBtn.addEventListener('pointerdown', rememberTextSelection, {passive:true}); italicBtn.addEventListener('click',()=>{\n      const t=state.selectedElement?.querySelector('.overlay-text'); if(!t)return;\n      if(!applyInlineStyleToSelection({fontStyle:getComputedStyle(t).fontStyle==='italic'?'normal':'italic'})){ t.style.fontStyle=getComputedStyle(t).fontStyle==='italic'?'normal':'italic'; }\n      italicBtn.classList.toggle('active', getComputedStyle(t).fontStyle==='italic'); saveStateToHistory();\n    }); }\n""")
# Replace createTextOverlay editing block
j=j.replace("""    el.addEventListener('dblclick', e => {\n      e.preventDefault(); e.stopPropagation();\n      textInput.contentEditable = true;\n      textInput.focus();\n      try { document.execCommand('selectAll', false, null); } catch (_) {}\n    });\n    textInput.addEventListener('blur', () => { textInput.contentEditable = false; saveStateToHistory(); });\n""", """    el.addEventListener('dblclick', e => {\n      e.preventDefault(); e.stopPropagation();\n      textInput.contentEditable = true;\n      textInput.style.userSelect = 'text';\n      textInput.focus();\n      setTool('text');\n      // Do not call selectAll here: the browser's normal word/character selection must remain available.\n    });\n    textInput.addEventListener('pointerdown', e => {\n      if (textInput.contentEditable === 'true') { e.stopPropagation(); }\n    }, {passive:false});\n    textInput.addEventListener('input', () => saveStateToHistory());\n    textInput.addEventListener('blur', () => { textInput.contentEditable = false; textInput.style.userSelect = 'none'; saveStateToHistory(); setTool('select'); });\n""")
# Replace updateSelectedElementStyle with helper suite
old=re.search(r"  function updateSelectedElementStyle\(\) \{.*?\n  \}\n\n  function deleteSelectedElement", j, re.S)
new=r'''  let savedTextRange = null;

  function getEditingTextElement() {
    const t = state.selectedElement?.querySelector('.overlay-text');
    return t && t.isContentEditable ? t : null;
  }

  function rememberTextSelection() {
    const t = getEditingTextElement();
    const sel = window.getSelection();
    if (!t || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (t.contains(range.commonAncestorContainer)) savedTextRange = range.cloneRange();
  }

  function restoreTextSelection() {
    if (!savedTextRange) return false;
    const t = getEditingTextElement();
    if (!t || !t.contains(savedTextRange.commonAncestorContainer)) return false;
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedTextRange); return true;
  }

  function applyInlineStyleToSelection(styles) {
    const t = getEditingTextElement();
    if (!t) return false;
    if (!restoreTextSelection()) return false;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    if (!t.contains(range.commonAncestorContainer)) return false;
    const wrapper = document.createElement('span');
    Object.entries(styles).forEach(([k,v]) => { wrapper.style[k] = v; });
    try {
      const frag = range.extractContents();
      wrapper.appendChild(frag);
      range.insertNode(wrapper);
      sel.removeAllRanges();
      const newRange = document.createRange(); newRange.selectNodeContents(wrapper); sel.addRange(newRange);
      savedTextRange = newRange.cloneRange();
      return true;
    } catch (_) { return false; }
  }

  function updateSelectedElementStyle() {
    if (!state.selectedElement || state.currentTool !== 'text') return;
    const txt = state.selectedElement.querySelector('.overlay-text');
    if (txt) {
      txt.style.color = state.activeColor;
      txt.style.fontSize = `${state.fontSize}px`;
      txt.style.fontFamily = state.fontFamily;
      txt.style.opacity = state.opacity;
      const align=document.getElementById('prop-text-align'); if(align && align.value) txt.style.textAlign=align.value;
    }
  }

  function deleteSelectedElement'''
if old: j=j[:old.start()]+new+j[old.end():]
else: print('update style block not found')
# Replace gesture block with preview-transform gesture
old=re.search(r"    // Mobile pinch-to-zoom.*?DOM\.canvasScrollContainer\.addEventListener\('pointercancel',gestureEnd\);", j, re.S)
new=r'''    // Mobile pinch-to-zoom: preview with CSS during the gesture, render once on release.
    const gesturePointers = new Map();
    let gestureBaseScale = 1, gesturePreviewScale = 1, gestureOrigin = null, gestureCenter = null;
    const isTouchPointer=e=>e.pointerType==='touch';
    const clearGesturePreview=()=>{ DOM.pageWrapper.style.transform=''; DOM.pageWrapper.style.transformOrigin=''; };
    const gestureStart=e=>{
      if(!isTouchPointer(e)||state.currentTool!=='select')return;
      gesturePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(gesturePointers.size===2){
        const pts=[...gesturePointers.values()];
        gestureBaseScale=state.zoomScale; gesturePreviewScale=gestureBaseScale;
        gestureCenter={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
        const wr=DOM.pageWrapper.getBoundingClientRect();
        gestureOrigin={x:gestureCenter.x-wr.left,y:gestureCenter.y-wr.top};
        DOM.pageWrapper.style.transformOrigin=`${gestureOrigin.x}px ${gestureOrigin.y}px`;
        e.preventDefault();
      }
    };
    const gestureMove=e=>{
      if(!isTouchPointer(e)||!gesturePointers.has(e.pointerId)||state.currentTool!=='select')return;
      gesturePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(gesturePointers.size!==2)return;
      const pts=[...gesturePointers.values()];
      const dist=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);
      if(!gestureStart.lastDistance) gestureStart.lastDistance=dist;
      const next=clamp(gestureBaseScale*(dist/gestureStart.lastDistance),.4,3);
      gesturePreviewScale=next;
      DOM.pageWrapper.style.transform=`scale(${next/gestureBaseScale})`;
      const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
      if(gestureCenter){ DOM.canvasScrollContainer.scrollLeft-=center.x-gestureCenter.x; DOM.canvasScrollContainer.scrollTop-=center.y-gestureCenter.y; }
      gestureCenter=center; e.preventDefault();
    };
    const gestureEnd=async e=>{
      if(!isTouchPointer(e))return;
      gesturePointers.delete(e.pointerId);
      if(gesturePointers.size<2){
        const finalScale=gesturePreviewScale;
        clearGesturePreview(); gestureStart.lastDistance=0; gestureCenter=null;
        if(Math.abs(finalScale-state.zoomScale)>.005) await setZoom(finalScale);
      }
    };
    DOM.canvasScrollContainer.addEventListener('pointerdown',gestureStart,{passive:false});
    DOM.canvasScrollContainer.addEventListener('pointermove',gestureMove,{passive:false});
    DOM.canvasScrollContainer.addEventListener('pointerup',gestureEnd);
    DOM.canvasScrollContainer.addEventListener('pointercancel',gestureEnd);'''
if old: j=j[:old.start()]+new+j[old.end():]
else: print('gesture block not found')
js.write_text(j,encoding='utf-8')
print('patched')
