/* Registered categories, with the same touch and keyboard picker on all devices. */
(() => {
 let groups=[],input,button,popup,active=-1,visible=[];
 const key=value=>typeof normalizeInventoryCategoryKey==='function'?normalizeInventoryCategoryKey(value):String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const label=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase().replace(/(^|[\s/])([a-záéíóúñ])/g,(_,space,letter)=>space+letter.toUpperCase());
 function close(){if(!popup)return;popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
 function position(){const r=input.getBoundingClientRect(),height=window.visualViewport?.height||innerHeight,below=height-r.bottom-10,above=r.top-10,room=Math.max(80,Math.min(250,Math.max(below,above)));popup.style.left=Math.max(8,r.left)+'px';popup.style.width=Math.min(r.width,innerWidth-16)+'px';popup.style.maxHeight=room+'px';popup.style.top=(below>=Math.min(180,above)?r.bottom+5:Math.max(8,r.top-popup.offsetHeight-5))+'px';}
 function choose(value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();input.focus();close();}
 function render(all=false){
  const query=key(input.value);visible=groups.filter(g=>all||!query||key(g.label).includes(query)||key(g.key).includes(query));active=-1;popup.replaceChildren();
  for(const [i,g] of visible.entries()){const option=document.createElement('button');option.type='button';option.role='option';option.id='registered-category-'+i;option.textContent=g.label;option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>choose(g.label));popup.append(option);}
  if(input.value.trim()&&!groups.some(g=>key(g.label)===query)){const create=document.createElement('button');create.type='button';create.role='option';create.id='registered-category-'+visible.length;create.className='category-create';create.textContent='Usar nueva categoría: '+label(input.value);create.addEventListener('pointerdown',event=>event.preventDefault());create.addEventListener('click',()=>choose(label(input.value)));popup.append(create);}
  if(!popup.children.length){const hint=document.createElement('span');hint.className='category-empty';hint.textContent='Aún no hay categorías registradas. Escribe una nueva.';popup.append(hint);}
  popup.hidden=false;input.setAttribute('aria-expanded','true');position();
 }
 function enhance(){
  if(input)return;input=document.getElementById('prod-categoria');if(!input)return;
  input.removeAttribute('list');input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls','registered-category-popup');input.setAttribute('aria-expanded','false');
  const wrapper=document.createElement('div');wrapper.className='registered-category-picker';input.before(wrapper);wrapper.append(input);
  button=document.createElement('button');button.type='button';button.textContent='⌄';button.setAttribute('aria-label','Ver categorías registradas');button.addEventListener('click',()=>{if(popup.hidden){input.focus();render(true);}else close();});wrapper.append(button);
  popup=document.createElement('div');popup.id='registered-category-popup';popup.className='registered-category-popup';popup.role='listbox';popup.hidden=true;document.body.append(popup);
  input.addEventListener('focus',()=>render(true));input.addEventListener('input',()=>render());
  input.addEventListener('blur',()=>{setTimeout(close,100);const match=groups.find(g=>key(g.label)===key(input.value)||key(g.key)===key(input.value));input.value=match?.label||label(input.value);});
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){close();return;}if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(popup.hidden)render(true);const options=popup.querySelectorAll('button');if(!options.length)return;active=active<0?(event.key==='ArrowDown'?0:options.length-1):(active+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((o,i)=>o.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant',options[active].id||'');options[active].scrollIntoView({block:'nearest'});}if(event.key==='Enter'&&!popup.hidden){event.preventDefault();popup.querySelectorAll('button')[Math.max(0,active)]?.click();}});
  document.addEventListener('pointerdown',event=>{if(!wrapper.contains(event.target)&&!popup.contains(event.target))close();});
  document.addEventListener('scroll',()=>{if(!popup.hidden)position();},true);addEventListener('resize',()=>{if(!popup.hidden)position();});window.visualViewport?.addEventListener('resize',()=>{if(!popup.hidden)position();});
 }
 window.BlyxuProductEditor={updateCategories(next){groups=next.filter(g=>g.key!=='banner');enhance();if(input){const match=groups.find(g=>key(g.label)===key(input.value));if(match)input.value=match.label;}}};
 document.addEventListener('DOMContentLoaded',enhance);
})();
