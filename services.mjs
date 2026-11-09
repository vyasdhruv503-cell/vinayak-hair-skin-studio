export const services = [
  {id:'haircut',name:'Haircut',category:'Hair essentials',price:100},
  {id:'special-cut',name:'Special haircut',category:'Hair essentials',price:150},
  {id:'wash-mask',name:'Hair wash with hair mask',category:'Hair essentials',price:70},
  {id:'hair-spa',name:'Hair spa',category:'Hair essentials',price:499,from:true},
  {id:'hair-colour',name:'Hair colour',category:'Hair essentials',price:150,from:true},
  {id:'keratin',name:'Keratin treatment',category:'Hair treatments'},
  {id:'hair-botox',name:'Hair Botox treatment',category:'Hair treatments'},
  {id:'nanoplastia',name:'Nanoplastia hair treatment',category:'Hair treatments'},
  {id:'hair-fall',name:'Hair fall control treatment',category:'Hair treatments'},
  {id:'regrowth',name:'Hair regrowth treatment',category:'Hair treatments'},
  {id:'other-hair',name:'Other hair treatments',category:'Hair treatments'},
  {id:'hydra',name:'Hydra facial',category:'Skin care'},
  {id:'microneedling',name:'Microneedling treatment',category:'Skin care'},
  {id:'skin',name:'Personalised skin treatments',category:'Skin care'}
];
export function priceLabel(s){return s.price ? `${s.from?'From ':''}₹${s.price}` : 'Price on consultation'}
