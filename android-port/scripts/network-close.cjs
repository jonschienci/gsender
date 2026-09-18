'use strict';
exports.transform=(source,id)=>{
    if(!id.endsWith('/lib/SerialConnection.js'))return source;
    const from="this.port.on('close', () => {\n                callback();\n            });";
    if(source.split(from).length!==2)throw Error('Network close handler changed upstream');
    return source.replace(from,"this.port.once('close', () => {\n                if (typeof callback === 'function') callback();\n            });");
};
