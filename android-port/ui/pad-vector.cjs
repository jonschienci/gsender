'use strict';
// Radial dead zone followed by smoothstep: no diagonal speed boost.
function padVector(x,y) {
    if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>1||Math.abs(y)>1)throw Error('Invalid XY pad position');
    const radius=Math.hypot(x,y),t=Math.max(0,Math.min(1,(radius-.06)/.94));
    const speed=t*t*(3-2*t);
    return {x:radius?x/radius*speed:0,y:radius?y/radius*speed:0,speed};
}
module.exports={padVector};
