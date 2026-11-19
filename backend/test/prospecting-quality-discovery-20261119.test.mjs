import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPlan, discoveryResult, discoverCandidates } from '../src/services/prospecting-discovery.mjs';

test('Yandex production preference keeps São Paulo and clothing-focused searches', () => {
  const previous=process.env.DIGITALE_PREFERRED_SEARCH_ENGINE;
  try {
    process.env.DIGITALE_PREFERRED_SEARCH_ENGINE='yandex';
    const p=searchPlan(52255,{states:['SP'],segments:['vestuário'],cnaes:['1412601']});
    assert.equal(p.engines,'yandex');
    assert.match(p.q,/São Paulo/);
    assert.match(p.q,/roupas|vestuário|confec|moda/i);
  } finally {
    if(previous===undefined)delete process.env.DIGITALE_PREFERRED_SEARCH_ENGINE;
    else process.env.DIGITALE_PREFERRED_SEARCH_ENGINE=previous;
  }
});

test('apparel company snippet may nominate an official website but does not approve it',async()=>{
  const proposed=discoveryResult({
    url:'https://confeccoes-exemplo.com.br/',
    title:'Marca de roupas femininas',
    content:'Coleção moda feminina, camisetas, jeans.'
  });
  assert.equal(proposed?.domain,'confeccoes-exemplo.com.br');
  const writes=[];
  const db={execute:async(sql,args)=>{
    if(sql.startsWith('SELECT'))return [[]];
    writes.push(sql);return [{affectedRows:1}];
  }};
  const result=await discoverCandidates(db,0,{
    settings:{states:['SP'],segments:['vestuário'],cnaes:['1412601']},
    fetchSearch:async()=>Response.json({results:[{
      url:'https://confeccoes-exemplo.com.br/',
      title:'Marca de roupas femininas',
      content:'Moda feminina, camisetas e jeans'
    }]}),
    fetchSite:async url=>({url,body:'<title>Loja de roupas femininas</title>Bem-vindo à loja de roupas.'})
  });
  assert.equal(result.found,0);
  assert.equal(writes.length,0);
});

test('verified manufacturer page still nominates a real candidate for later CNPJ verification',async()=>{
  const writes=[];
  const db={execute:async(sql,args)=>{
    if(sql.startsWith('SELECT'))return [[]];
    writes.push({sql,args});return [{affectedRows:1}];
  }};
  const result=await discoverCandidates(db,0,{
    settings:{states:['SP'],segments:['vestuário'],cnaes:['1412601']},
    fetchSearch:async()=>Response.json({results:[{
      url:'https://confeccoes-exemplo.com.br/',
      title:'Moda feminina fábrica de roupas',
      content:'Roupas femininas'
    }]}),
    fetchSite:async url=>({url,body:'<title>Fábrica de roupas</title>Somos fabricantes de roupas com produção própria e confecção de vestuário.'})
  });
  assert.equal(result.found,1);
  assert.equal(writes.length,1);
  assert.match(writes[0].sql,/prospecting_auto_candidates/);
});
