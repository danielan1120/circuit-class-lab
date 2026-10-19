import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://127.0.0.1:5173';
const room = `qa-${crypto.randomUUID().slice(0,8)}`;
const image = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zAAAAABJRU5ErkJggg==','base64'));
async function upload(group,experiment,note='검증용 그래프') {
 const data=new FormData(); for(const [k,v] of Object.entries({room,group:String(group),experiment,note}))data.set(k,v);
 data.set('file',new File([image],'test.png',{type:'image/png'}));
 const r=await fetch(`${base}/api/graphs`,{method:'POST',body:data,headers:{Origin:base}});const body=await r.json();assert.equal(r.status,201,JSON.stringify(body));return body;
}
const a=await upload(1,'voltage');const b=await upload(2,'voltage');const c=await upload(1,'resistance');
let list=await (await fetch(`${base}/api/graphs?room=${room}`)).json();assert.equal(list.graphs.length,3);assert.equal(new Set(list.graphs.map(g=>g.experiment)).size,2);
const img=await fetch(base+a.graph.imageUrl);assert.equal(img.status,200);assert.equal(img.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await img.arrayBuffer()),image);
const wrong=await fetch(`${base}/api/graphs?id=${a.graph.id}&room=${room}`,{method:'DELETE',headers:{Origin:base,'X-Delete-Token':'0'.repeat(64)}});assert.equal(wrong.status,403);
const replaced=await upload(1,'voltage','교체 후');list=await(await fetch(`${base}/api/graphs?room=${room}`)).json();assert.equal(list.graphs.length,3);assert.equal(list.graphs.find(g=>g.group===1&&g.experiment==='voltage').note,'교체 후');
const isolated=await(await fetch(`${base}/api/graphs?room=${room}-other`)).json();assert.equal(isolated.graphs.length,0);
for(const x of [replaced,b,c]){const r=await fetch(`${base}/api/graphs?id=${x.graph.id}&room=${room}`,{method:'DELETE',headers:{Origin:base,'X-Delete-Token':x.deleteToken}});assert.equal(r.status,200);}
list=await(await fetch(`${base}/api/graphs?room=${room}`)).json();assert.equal(list.graphs.length,0);
console.log('PASS upload, cross-request persistence, image bytes, experiment separation, room isolation, overwrite, forbidden delete, authorized cleanup');
