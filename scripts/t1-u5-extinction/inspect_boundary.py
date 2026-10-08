import json,collections,sys
sys.stdout.reconfigure(encoding='utf-8')
d=json.load(open(sys.argv[1],encoding='utf-8'))
fs=d['features']
sgg=collections.Counter((f['properties']['sgg'],f['properties']['sidonm'],f['properties']['sggnm']) for f in fs)
for k in sorted(sgg): print(*k,sgg[k])
