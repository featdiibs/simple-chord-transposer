const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const NOTE_TO_VALUE = {
  'C':0,'B#':0,
  'C#':1,'Db':1,
  'D':2,
  'D#':3,'Eb':3,
  'E':4,'Fb':4,
  'F':5,'E#':5,
  'F#':6,'Gb':6,
  'G':7,
  'G#':8,'Ab':8,
  'A':9,
  'A#':10,'Bb':10,
  'B':11,'Cb':11
};
const DROPDOWN_KEYS = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];

const inputArea = document.getElementById('inputArea');
const originalKeySelect = document.getElementById('originalKey');
const transposedKeySelect = document.getElementById('transposedKey');
const semitoneInput = document.getElementById('semitoneInput');
const plusBtn = document.getElementById('plusBtn');
const minusBtn = document.getElementById('minusBtn');
const transposeBtn = document.getElementById('transposeBtn');
const detectKeyBtn = document.getElementById('detectKeyBtn');
const outputPreview = document.getElementById('outputPreview');
const sharpToggle = document.getElementById('sharpToggle');
const flatToggle = document.getElementById('flatToggle');

let useFlats = false;
let semitoneShift = 0;

function populateKeyDropdowns() {
  originalKeySelect.innerHTML = '';
  transposedKeySelect.innerHTML = '';
  DROPDOWN_KEYS.forEach(k => {
    const o1 = document.createElement('option'); o1.value = k; o1.textContent = k;
    const o2 = document.createElement('option'); o2.value = k; o2.textContent = k;
    originalKeySelect.appendChild(o1);
    transposedKeySelect.appendChild(o2);
  });
  originalKeySelect.value = 'C';
  transposedKeySelect.value = 'C';
}
populateKeyDropdowns();

function noteValue(note){ return NOTE_TO_VALUE[note]; }
function noteNameFromValue(v, preferFlats){
  v=((v%12)+12)%12;
  return preferFlats?NOTES_FLAT[v]:NOTES_SHARP[v];
}
function parseChordToken(token){
  const m = token.match(/^([A-G][#b]?)([^\/\s]*)?(?:\/([A-G][#b]?))?$/);
  if(!m) return null;
  return { root:m[1], suffix:m[2]||'', bass:m[3]||null };
}
function transposeChord(chordStr,shift,preferFlats){
  const parsed=parseChordToken(chordStr);
  if(!parsed) return chordStr;
  const {root,suffix,bass}=parsed;
  const rootVal=noteValue(root);
  if(rootVal===undefined) return chordStr;
  const newRoot=noteNameFromValue(rootVal+shift,preferFlats);
  let out=newRoot+suffix;
  if(bass){
    const bassVal=noteValue(bass);
    const newBass=(bassVal===undefined)?bass:noteNameFromValue(bassVal+shift,preferFlats);
    out+='/'+newBass;
  }
  return out;
}
function escapeHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function findChordMatches(line){
  const re=/([\(\[\{])?([A-G][#b]?[^ \n\t,()\[\]{}\/]*?(?:\/[A-G][#b]?)?)([\)\]\}])?/g;
  const out=[];let m;
  while((m=re.exec(line))!==null){
    const raw=m[0],openB=m[1]||'',token=m[2],closeB=m[3]||'';
    const parsed=parseChordToken(token);
    if(parsed) out.push({index:m.index,length:raw.length,openB,token,closeB});
    if(m.index===re.lastIndex) re.lastIndex++;
  }
  return out;
}
function likelyChordLine(line){
  const words=line.trim().split(/\s+/).filter(Boolean);
  if(words.length===0) return false;
  let chordCount=0;
  for(const w of words){
    const tok=w.replace(/^[\(\[\{]+|[\)\]\}]+$/g,'');
    if(parseChordToken(tok)) chordCount++;
  }
  return(chordCount/words.length)>=0.6;
}
function buildTransposedPreview(text,shift){
  const preferFlats=useFlats;
  const lines=text.split('\n');
  const resultLines=lines.map(line=>{
    const hasBracket=/[\(\[\{].*?[\)\]\}]/.test(line);
    if(!likelyChordLine(line)&&!hasBracket){
      return{plain:line,html:`<span>${escapeHtml(line)}</span>`};
    }
    let cursor=0,plain='',html='';
    const matches=findChordMatches(line);
    if(matches.length===0)return{plain:line,html:`<span>${escapeHtml(line)}</span>`};
    for(const m of matches){
      if(m.index>cursor){
        const before=line.slice(cursor,m.index);
        plain+=before;html+=`<span>${escapeHtml(before)}</span>`;
      }
      const open=m.openB||'',close=m.closeB||'';
      const transposed=transposeChord(m.token,shift,preferFlats);
      plain+=open+transposed+close;
      html+=escapeHtml(open)+`<span class="chord">${escapeHtml(transposed)}</span>`+escapeHtml(close);
      cursor=m.index+m.length;
    }
    if(cursor<line.length){
      const rest=line.slice(cursor);
      plain+=rest;html+=`<span>${escapeHtml(rest)}</span>`;
    }
    return{plain,html};
  });
  return{plain:resultLines.map(r=>r.plain).join('\n'),html:resultLines.map(r=>r.html).join('\n')};
}
function detectKeySuggestion(text){
  const tokens=[];const lines=text.split('\n');
  for(const line of lines){
    if(likelyChordLine(line)||/[\(\[\{].*?[\)\]\}]/.test(line)){
      const re=/([A-G][#b]?)(?=[\s\/\]\)\},]|$)/g;let m;
      while((m=re.exec(line))!==null){
        const root=m[1];
        if(noteValue(root)!==undefined)tokens.push(root);
        if(m.index===re.lastIndex)re.lastIndex++;
      }
    }
  }
  if(tokens.length===0)return null;
  const counts={};
  tokens.forEach(t=>{const v=noteValue(t);counts[v]=(counts[v]||0)+1;});
  let best=null,max=-1;
  for(const k in counts){if(counts[k]>max){max=counts[k];best=parseInt(k);}}
  if(best===null)return null;
  return noteNameFromValue(best,useFlats);
}

function syncSemitoneFromKeys(){
  const from=originalKeySelect.value,to=transposedKeySelect.value;
  const fromVal=noteValue(from),toVal=noteValue(to);
  if(fromVal===undefined||toVal===undefined)return;
  semitoneShift=(toVal-fromVal+12)%12;
  semitoneInput.value=semitoneShift;
}
function syncTransposedFromSemitone(){
  const from=originalKeySelect.value,fromVal=noteValue(from);
  const v=parseInt(semitoneInput.value);
  if(fromVal===undefined||isNaN(v))return;
  const newVal=(fromVal+v+12)%12;
  const name=noteNameFromValue(newVal,useFlats);
  if([...transposedKeySelect.options].some(o=>o.value===name)){
    transposedKeySelect.value=name;
  }else{
    for(const opt of transposedKeySelect.options){
      if(noteValue(opt.value)===newVal){transposedKeySelect.value=opt.value;break;}
    }
  }
}

function performTranspose(){
  const fromVal=noteValue(originalKeySelect.value);
  const toVal=noteValue(transposedKeySelect.value);
  if(fromVal===undefined||toVal===undefined)return;
  semitoneShift=(toVal-fromVal+12)%12;
  semitoneInput.value=semitoneShift;
  const text=inputArea.value||'';
  const res=buildTransposedPreview(text,semitoneShift);
  outputPreview.innerHTML=res.html||'';
  outputPreview.dataset.plain=res.plain;
}
function onDetectKeyClick(){
  const suggested=detectKeySuggestion(inputArea.value||'');
  if(suggested){
    originalKeySelect.value=suggested;
    const prev=detectKeyBtn.textContent;
    detectKeyBtn.textContent=`Detected: ${suggested}`;
    setTimeout(()=>detectKeyBtn.textContent=prev,1500);
  }else{
    const prev=detectKeyBtn.textContent;
    detectKeyBtn.textContent='No key';
    setTimeout(()=>detectKeyBtn.textContent=prev,1200);
  }
}

detectKeyBtn.addEventListener('click', onDetectKeyClick);
sharpToggle.addEventListener('click', ()=>{
  useFlats=false;sharpToggle.classList.add('active');flatToggle.classList.remove('active');
  syncTransposedFromSemitone();
});
flatToggle.addEventListener('click', ()=>{
  useFlats=true;flatToggle.classList.add('active');sharpToggle.classList.remove('active');
  syncTransposedFromSemitone();
});
transposedKeySelect.addEventListener('change', ()=>{syncSemitoneFromKeys();});
originalKeySelect.addEventListener('change', ()=>{syncSemitoneFromKeys();syncTransposedFromSemitone();});
semitoneInput.addEventListener('change', ()=>{
  const v=parseInt(semitoneInput.value);
  semitoneShift=isNaN(v)?0:((v%12)+12)%12;
  semitoneInput.value=semitoneShift;
  syncTransposedFromSemitone();
});
plusBtn.addEventListener('click', ()=>{
  semitoneShift=((parseInt(semitoneInput.value)||0)+1)%12;
  semitoneInput.value=semitoneShift;
  syncTransposedFromSemitone();
});
minusBtn.addEventListener('click', ()=>{
  semitoneShift=((parseInt(semitoneInput.value)||0)-1+12)%12;
  semitoneInput.value=semitoneShift;
  syncTransposedFromSemitone();
});
transposeBtn.addEventListener('click', performTranspose);
inputArea.addEventListener('input', ()=>{
  if(outputPreview.dataset.plain){
    const res=buildTransposedPreview(inputArea.value||'',semitoneShift);
    outputPreview.innerHTML=res.html;
    outputPreview.dataset.plain=res.plain;
  }
});
syncTransposedFromSemitone();
