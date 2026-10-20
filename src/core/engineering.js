// Educational first-order checks; inputs are explicit, no automatic load inference.
// Formula references and applicability: VYPOCTY-A-OBRABENI.md.
function positive(x,name){if(!Number.isFinite(x)||x<=0)throw Error(name+' musí být kladné číslo.');}
function nonnegative(x,name){if(!Number.isFinite(x)||x<0)throw Error(name+' nesmí být záporné.');}
export function beamCheck({width,height,t,span,q,force,E=210000,fy=235,limit=250}){
  for(const [k,v]of Object.entries({width,height,t,span,E,fy,limit}))positive(v,k);
  nonnegative(q,'Spojité zatížení');nonnegative(force,'Bodová síla');
  if(2*t>=Math.min(width,height))throw Error('Tloušťka neodpovídá dutému jeklu.');
  // q in kN/m equals N/mm, force is kN; load acts along section height.
  const I=(width*height**3-(width-2*t)*(height-2*t)**3)/12,W=2*I/height;
  const M=q*span**2/8+force*1000*span/4;
  const stress=M/W,deflection=5*q*span**4/(384*E*I)+force*1000*span**3/(48*E*I);
  return {I,W,momentKNm:M/1e6,reactionKN:(q*span+force*1000)/2000,stress,deflection,allowable:span/limit,stressRatio:stress/fy,deflectionRatio:deflection/(span/limit)};
}
export function weldCheck({force,a,length,fu=360,beta=.8,gamma=1.25}){
  for(const [k,v]of Object.entries({a,length,fu,beta,gamma}))positive(v,k);nonnegative(force,'Návrhová síla');
  if(gamma<1||beta<.5||beta>1.5)throw Error('Neplatné součinitele svaru.');
  if(length<Math.max(30,6*a))throw Error('Účinná délka musí být alespoň max(30 mm, 6a).');
  const strength=fu/(Math.sqrt(3)*beta*gamma),capacityKN=strength*a*length/1000;
  return {strength,capacityKN,utilization:force/capacityKN,requiredA:force*1000/(strength*length),leg:a*Math.SQRT2};
}
