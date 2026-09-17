'use strict';
// The dev pendant's buttons sit in a scroll container. Reserve the gesture for
// the jog control, and route cancellation through the hook to clear its timer.
exports.transform=(code,id)=>{
 if(!id.endsWith('/pendant/src/components/JoggingCard.tsx'))return null;
 const replace=(from,to)=>{if(code.split(from).length!==2)throw Error('Pendant touch handler changed');code=code.replace(from,to);};
 replace('key={id}\n            type="button"','key={id}\n            style={{touchAction:"none",transitionDuration:active?"0ms":undefined}}\n            type="button"');
 replace('{...longPressBind}',`{...longPressBind}
            onPointerCancel={event=>longPressBind.onPointerLeave?.(event)}
            onLostPointerCapture={event=>longPressBind.onPointerLeave?.(event)}
            onTouchCancel={event=>longPressBind.onPointerLeave?.(event as any)}`);
 replace('transition-all duration-150 focus:outline-none','transition-colors duration-75 focus:outline-none');
 return {code,map:null};
};
