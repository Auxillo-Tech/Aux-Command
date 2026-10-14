#!/usr/bin/env python3
"""Development-only offline catalog generation from downloaded Argos models.
Requires ctranslate2 and sentencepiece; neither ships with Aux Command.
Existing catalog entries take precedence. Review generated wording before release.
"""
import argparse, concurrent.futures, json, re, subprocess, time, unicodedata
from pathlib import Path
import ctranslate2, sentencepiece
parser=argparse.ArgumentParser();parser.add_argument('--models',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
sources=json.loads((root/'scripts/ui-message-sources.json').read_text())
curated=json.loads(subprocess.check_output(['node','-e',"const a=require('./src/renderer/i18n.js'),r={...a.MESSAGES};for(const [key,source] of Object.entries(a.CATALOGS.en))if(!r[source])r[source]=Object.fromEntries(Object.entries(a.CATALOGS).map(([l,c])=>[l,c[key]]));console.log(JSON.stringify(r));"],cwd=root,text=True))
output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
models={}
for metadata in Path(args.models).glob('*/metadata.json'):
 data=json.loads(metadata.read_text())
 if data.get('from_code')=='en':models[data['to_code']]=(metadata.parent,data)
protected=re.compile(r'\{[a-zA-Z][a-zA-Z0-9]*\}|`[^`]+`|~?/[^\s,;()]+|\b(?:Aux Command|Ctrl\+[^\s,.]+|OpenPGP|OpenSSH|GitHub|Wayland|AppImage|Bash|SSH|SFTP|FTPS|FTP|SCP|RDP|VNC|Mosh|PTY|X11|Linux|Debian|JSON|CPU|MFA|DNS|UTF-8|llama\.cpp|Ollama|OpenAI|tmux|vim|htop)\b')
def language(code):
 path,metadata=models[code];sp=sentencepiece.SentencePieceProcessor(model_file=str(path/'sentencepiece.model'))
 model=ctranslate2.Translator(str(path/'model'),device='cpu',compute_type='int8',intra_threads=2,inter_threads=1)
 def translate(texts):
  prefix=metadata.get('target_prefix','')
  params=dict(beam_size=4,replace_unknowns=True,max_batch_size=512,batch_type='tokens')
  if prefix:params['target_prefix']=[[prefix]]*len(texts)
  result=model.translate_batch([sp.encode(t,out_type=str) for t in texts],**params)
  translated=[sp.decode(r.hypotheses[0]).replace('▁', ' ').strip() for r in result]
  if prefix:translated=[t.removeprefix(prefix).strip() for t in translated]
  return translated
 previous=output/(code+'.json'); existing=json.loads(previous.read_text()) if previous.exists() else {}
 previous_review=output/(code+'-review.json');review=json.loads(previous_review.read_text()) if previous_review.exists() else []
 result={};todo=[s for s in sources if not curated.get(s,{}).get(code) and not existing.get(s)]
 for source in sources:
  if curated.get(source,{}).get(code):result[source]=curated[source][code]
  elif existing.get(source):result[source]=existing[source]
 started=time.monotonic()
 for offset in range(0,len(todo),24):
  group=todo[offset:offset+24];maps=[];inputs=[]
  for source in group:
   tokens=[]
   def replace(match):tokens.append(match[0]);return f'ZQX{len(tokens)-1}ZQX'
   inputs.append(protected.sub(replace,source));maps.append(tokens)
  for source,translated,tokens in zip(group,translate(inputs),maps):
   translated=unicodedata.normalize('NFKC',translated);valid=bool(translated)
   for i,token in enumerate(tokens):
    pattern=re.compile(r'Z\s*Q\s*X\s*'+str(i)+r'\s*Z\s*Q\s*X',re.I)
    if not pattern.search(translated):valid=False;break
    translated=pattern.sub(lambda _:token,translated)
   if not valid:
    review.append({'source':source,'reason':'protected-token segmented fallback'})
    pieces=re.split('('+protected.pattern+')',source)
    indexes=[i for i,piece in enumerate(pieces) if piece.strip() and not protected.fullmatch(piece)]
    translated_parts=translate([pieces[i].strip() for i in indexes]) if indexes else []
    for i,text in zip(indexes,translated_parts):
     original=pieces[i];pieces[i]=original[:len(original)-len(original.lstrip())]+text+original[len(original.rstrip()):]
    translated=''.join(pieces)
   if not translated.strip():raise RuntimeError(f'Empty translation: {code}: {source}')
   result[source]=translated
   if translated==source:review.append({'source':source,'reason':'unchanged'})
  (output/(code+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2))
  print(json.dumps(dict(language=code,done=min(offset+24,len(todo)),total=len(todo),seconds=round(time.monotonic()-started,1))),flush=True)
 (output/(code+'-review.json')).write_text(json.dumps(review,ensure_ascii=False,indent=2))
 return code
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for code in pool.map(language,['de','es','fr','it','ja','pt','ru','zh']):print('complete',code,flush=True)
