import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {candidatosEquipoMalo,crearFilaJugador} from '../app/catalogo.mjs';
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/styles.css',import.meta.url),'utf8');
const sw=readFileSync(new URL('../app/sw.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app/app.js',import.meta.url),'utf8');
test('previsión: solo mercado abierto, segundo día, valor positivo estrictamente inferior a 750.000 €',()=>{
 const row={estado:'open',dia_mercado:2,valor_mercado_centimos:'74999999'};
 assert.equal(candidatosEquipoMalo([row,{...row,dia_mercado:1},{...row,estado:'draft'},{...row,valor_mercado_centimos:'75000000'},{...row,valor_mercado_centimos:0},{...row,valor_mercado_centimos:'incorrecto'}]),1);
});
test('fila compacta separa nombre, posición, club, puntos y valoración',()=>{
 class Node {constructor(tag){this.tag=tag;this.children=[]}appendChild(n){this.children.push(n)}}
 const doc={createElement:tag=>new Node(tag)};
 const row=crearFilaJugador(doc,{nombre_jugador:'Futbolista de ensayo',posicion:'MID',club:'Club ficticio',puntos_acumulados:0,valor_mercado_centimos:'74999999'},{estado:'Día 2'});
 assert.equal(row.className,'compact-player');
 assert.equal(row.children[0].children[0].textContent,'Futbolista de ensayo');
 assert.equal(row.children[0].children[1].textContent,'Centrocampista · Club ficticio · 0 pts · Día 2');
 assert.match(row.children[1].children[1].textContent,/749[.\s]999,99/);
});
test('menú privado conserva todos los accesos y no duplica identificadores',()=>{
 const section=html.match(/<nav class="bottom-nav compact-nav"[\s\S]*?<\/nav>/)?.[0];
 assert.ok(section);
 for(const view of ['home','team','market','bad','lineup','news','standings','rules','cup','admin'])assert.match(section,new RegExp('data-view="'+view+'"'));
 assert.ok(html.indexOf(section)>html.indexOf('id="private-view" hidden'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 assert.match(app,/nombre === 'sales' \? 'market' : nombre/);
 assert.match(app,/more\.open = false/);
 assert.match(css,/\.compact-nav[^{]*\{position:sticky/);
});
test('versión coherente HTML, módulos y caché',()=>{
 assert.match(html,/data-release="29"/);
 assert.match(html,/styles\.css\?v=29/);
 assert.match(html,/app\.js\?v=29/);
 assert.match(app,/catalogo\.mjs\?v=29/);
 assert.match(sw,/estatica-v29/);
 assert.match(sw,/catalogo\.mjs\?v=29/);
});
