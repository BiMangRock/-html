import re,shutil,os
W='/tmp/claude-0/-home-claude/3e4dc764-894e-5016-a101-0f8c00097e4e/scratchpad'
eng=open(W+'/work/engine.js',encoding='utf-8').read()
t=open('build/template.html',encoding='utf-8').read()
open('index.html','w',encoding='utf-8').write(t.replace('//__ENGINE__',eng))
src=W+'/cd/card_duel_v113/images'
used=set(re.findall(r'(?:images/|["\'])((?:card|art|fx)[A-Za-z0-9_]*\.(?:png|jpg))',t))
used|=set(re.findall(r'"([A-Za-z0-9_]+\.(?:png|jpg))"',t))
os.makedirs('images',exist_ok=True)
for f in sorted(used):
    p=os.path.join(src,f)
    if os.path.exists(p): shutil.copy(p,'images/'+f)
    else: print('missing',f)
print(len(os.listdir('images')),'images')
