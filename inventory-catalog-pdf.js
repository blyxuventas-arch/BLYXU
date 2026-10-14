/* Photo-led customer catalog. QR payloads use the same references as inventory labels. */
(function(root){
 function drawQr(doc,payload,x,y,size,makeQr){
  if(!payload)return;
  const qr=makeQr(0,'M');qr.addData(payload);qr.make();
  const modules=qr.getModuleCount(),unit=size/(modules+8);
  doc.setFillColor(255,255,255);doc.rect(x,y,size,size,'F');
  doc.setFillColor(0,0,0);
  for(let row=0;row<modules;row++)for(let col=0;col<modules;col++)if(qr.isDark(row,col))doc.rect(x+(col+4)*unit,y+(row+4)*unit,unit,unit,'F');
 }
 function draw(doc,rows,options){
  const groups=new Map();
  for(const row of rows){const key=row.categoryKey||row.category; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  let page=0;
  for(const items of groups.values())for(let offset=0;offset<items.length;offset+=4){
   if(page)doc.addPage();page++;
   options.header(doc,options.meta);
   doc.setFillColor(247,244,252);doc.rect(10,33,190,7,'F');
   doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(85,65,135);
   doc.text(doc.splitTextToSize(items[0].categoryLabel||items[0].category,184).slice(0,1),13,37.8);
   items.slice(offset,offset+4).forEach((row,index)=>{
    const x=10+(index%2)*98,y=44+Math.floor(index/2)*118,w=92;
    doc.setDrawColor(231,226,237);doc.setFillColor(255,255,255);doc.roundedRect(x,y,w,112,2,2,'FD');
    if(row.image)doc.addImage(row.image,'JPEG',x+5,y+3,82,82,undefined,'FAST');
    doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(25,22,30);
    doc.text(doc.splitTextToSize(row.name,66).slice(0,2),x+4,y+89);
    doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(100,95,108);
    doc.text(doc.splitTextToSize(`Ref: ${row.reference||'-'}`,66).slice(0,2),x+4,y+97);
    drawQr(doc,row.qrReference,x+72,y+86,17,options.makeQr);
    const prices=[];
    if(options.showDetal)prices.push(['DETAL',row.detal]);
    if(options.showMayorista)prices.push(['MAYORISTA',row.mayorista]);
    prices.forEach(([label,value],priceIndex)=>{
     const px=x+4+priceIndex*43;
     doc.setFont('helvetica','normal');doc.setFontSize(6);doc.setTextColor(100,95,108);doc.text(label,px,y+103.5);
     doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(45,28,65);doc.text(value,px,y+109);
    });
   });
   options.footer(doc,page);
  }
  return page;
 }
 const api={draw,drawQr};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BlyxuInventoryPdf=api;
})(typeof window==='object'?window:globalThis);
