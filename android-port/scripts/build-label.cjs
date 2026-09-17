'use strict';
// The packager sets this value in each HTML entry before React loads, so a
// backend-only APK update cannot keep a stale number from cached UI assets.
const badge = `<span aria-label={'gSender Android Build ' + (window as any).__gsenderAndroidBuildNumber}
    style={{width:36,height:36,display:'inline-flex',flexDirection:'column',alignItems:'center',justifyContent:'center',lineHeight:1.05,fontVariantNumeric:'tabular-nums',color:'inherit'}}>
    <span style={{fontSize:10,fontWeight:600}}>Build</span>
    <span style={{fontSize:18,fontWeight:800}}>{(window as any).__gsenderAndroidBuildNumber}</span>
</span>`;
exports.transform = (code, id) => {
    const logo = id.endsWith('/pendant/src/components/PendantTopBar.tsx')
        ? '<img src={iconRound} alt="gSender" className="w-9 h-9" />'
        : id.endsWith('/app/src/features/IconUpdater/index.tsx')
            ? '<img alt="gSender Logo" src={gSenderIcon} />' : null;
    if (!logo) return null;
    if (code.split(logo).length !== 2) throw Error('Android build label: upstream header logo changed');
    // Preserve the parent layout and pendant hold-to-quit gesture.
    return {code:code.replace(logo,badge),map:null};
};
