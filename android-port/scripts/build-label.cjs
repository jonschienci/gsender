'use strict';
const path = require('node:path');
// The packager sets the badge's build number before React loads. The shared
// component also provides the native kiosk exit in desktop and pendant views.
exports.transform = (code, id) => {
    const logo = id.endsWith('/pendant/src/components/PendantTopBar.tsx')
        ? '<img src={iconRound} alt="gSender" className="w-9 h-9" />'
        : id.endsWith('/app/src/features/IconUpdater/index.tsx')
            ? '<img alt="gSender Logo" src={gSenderIcon} />' : null;
    if (!logo) return null;
    if (code.split(logo).length !== 2) throw Error('Android build label: upstream header logo changed');
    const imported = 'import AndroidBuildBadge from ' + JSON.stringify(path.resolve(__dirname, '../ui/AndroidBuildBadge.tsx')) + ';\n';
    return {code:imported + code.replace(logo, '<AndroidBuildBadge />'),map:null};
};
