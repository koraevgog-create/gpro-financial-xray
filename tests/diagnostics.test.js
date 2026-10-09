/* GPRO financial xray regression tests. Run: node tests/diagnostics.test.js */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function between(a,b){const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,'missing source boundary: '+a);return source.slice(i,j)}
const selected=between('function calculateScore(','function block(')+between('function profile(','function renderProfile(');
const ctx={values:{cash:0,assets:0},money:n=>Math.round(n).toLocaleString('ru-RU')+' ₽',clamp:(n,a,b)=>Math.max(a,Math.min(b,n))};vm.createContext(ctx);vm.runInContext(selected,ctx);
const cases=[
 {name:'empty',income:0,monthly:0,free:0,essentials:0,payments:0,load:null,assets:0,debt:0,net:0,buffer:null,cash:0,expected:null},
 {name:'deficit',income:100000,monthly:130000,free:-30000,essentials:100000,payments:10000,load:.1,assets:200000,debt:50000,net:150000,buffer:.5,cash:50000,profile:'Денежный поток в дефиците'},
 {name:'high-debt',income:100000,monthly:90000,free:10000,essentials:60000,payments:55000,load:.55,assets:500000,debt:900000,net:-400000,buffer:3,cash:180000,profile:'Высокая долговая зависимость'},
 {name:'illiquid',income:100000,monthly:60000,free:40000,essentials:40000,payments:0,load:0,assets:5000000,debt:0,net:5000000,buffer:.5,cash:20000,profile:'Недостаточный запас прочности'},
 {name:'healthy',income:200000,monthly:90000,free:110000,essentials:70000,payments:10000,load:.05,assets:3000000,debt:200000,net:2800000,buffer:6,cash:420000,profile:'Основа для накопления капитала'},
 {name:'no-income',income:0,monthly:60000,free:-60000,essentials:60000,payments:0,load:null,assets:0,debt:0,net:0,buffer:0,cash:0,profile:'Нет подтверждённого дохода'}
];
for(const t of cases){ctx.values.cash=t.cash;const score=ctx.calculateScore(t);assert(score===null||(Number.isInteger(score)&&score>=0&&score<=100),t.name+' score range');if('expected'in t)assert.equal(score,t.expected);const p=ctx.profile(t);assert(p.issues.length<=3,t.name+' issue count');if(t.profile)assert.equal(p.name,t.profile,t.name+' profile');if(t.name==='deficit')assert.equal(p.primary.title,'Ежемесячный дефицит');console.log('PASS',t.name,'score:',score,'profile:',p.name)}
console.log('6 diagnostic scenarios passed');
